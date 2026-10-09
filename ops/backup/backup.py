#!/usr/bin/env python3
"""Encrypted MySQL backups. Only ciphertext leaves the temporary directory."""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parent
IMAGE = "mysql:8.4"


def config(directory, variable):
    value = os.environ.get(variable, "")
    if not value:
        raise ValueError(f"Falta configurar {variable}.")
    try:
        url = urlsplit(value)
        database = unquote(url.path.lstrip("/"))
        port = url.port or 3306
        fields = {"host": url.hostname, "user": unquote(url.username or ""),
                  "password": unquote(url.password or "")}
        if url.scheme != "mysql" or not all(fields.values()) or url.query or url.fragment:
            raise ValueError()
        if not re.fullmatch(r"[A-Za-z0-9_]+", database):
            raise ValueError()
        if any(any(ord(c) < 32 for c in v) for v in fields.values()):
            raise ValueError()
    except (ValueError, TypeError):
        raise ValueError(f"{variable} no es una URL MySQL válida.") from None
    def escape(v):
        return v.replace("\\", "\\\\").replace('"', '\\"')
    text = "[client]\n" + "".join(f'{k}="{escape(v)}"\n' for k, v in fields.items())
    text += f"port={port}\nprotocol=TCP\nssl-mode=REQUIRED\n"
    path = directory / "client.cnf"
    path.write_text(text)
    path.chmod(0o600)
    return database


def client(directory, command, *args):
    return ["docker", "run", "--rm", "-i", "--network", "host", "--mount",
            f"type=bind,src={directory},dst=/run/backup,readonly", IMAGE,
            command, "--defaults-extra-file=/run/backup/client.cnf", *args]


def quiet_run(command, **kwargs):
    result = subprocess.run(command, stderr=subprocess.PIPE, **kwargs)
    if result.returncode:
        # Database errors can contain host names, SQL and credentials. Never log them.
        raise RuntimeError("Falló la operación. Verificá conexión TLS, permisos y configuración; no se publicó una copia.")
    return result


def create(output, recipient):
    output.mkdir(parents=True, exist_ok=True)
    name = "ecommerce-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + ".sql.gz.cms"
    destination = output / name
    with tempfile.TemporaryDirectory(prefix="ecommerce-backup-") as work:
        directory = Path(work)
        database = config(directory, "BACKUP_DATABASE_URL")
        if database != "ecommerce":
            raise ValueError("El respaldo de la tienda solo admite la base ecommerce.")
        compressed = directory / "dump.sql.gz"
        args = ["--single-transaction", "--quick", "--no-tablespaces",
                "--set-gtid-purged=OFF", "--column-statistics=0", "--hex-blob",
                "--skip-add-drop-table", "--skip-add-locks", "--default-character-set=utf8mb4",
                database]
        with (directory / "errors").open("wb") as errors:
            process = subprocess.Popen(client(directory, "mysqldump", *args),
                                       stdout=subprocess.PIPE, stderr=errors)
            try:
                with gzip.open(compressed, "wb") as zipped:
                    shutil.copyfileobj(process.stdout, zipped)
            finally:
                process.stdout.close()
                code = process.wait()
        if code:
            raise RuntimeError("No se pudo copiar MySQL. Revisá el secreto, la conexión TLS y los permisos.")
        with gzip.open(compressed, "rb") as source:
            if not source.read(1):
                raise RuntimeError("MySQL produjo una copia vacía.")
        encrypted = directory / "encrypted.cms"
        quiet_run(["openssl", "cms", "-encrypt", "-aes-256-gcm", "-binary", "-outform", "DER",
                   "-in", str(compressed), "-out", str(encrypted), "-recip", str(recipient),
                   "-keyopt", "rsa_padding_mode:oaep", "-keyopt", "rsa_oaep_md:sha256"], stdout=subprocess.DEVNULL)
        # Only publish after both mysqldump and authenticated encryption succeed.
        shutil.copyfile(encrypted, destination)
        destination.chmod(0o600)
    with destination.open("rb") as source:
        digest = hashlib.file_digest(source, "sha256").hexdigest()
    (output / (name + ".sha256")).write_text(f"{digest}  {name}\n")
    print("Copia cifrada creada: " + name)


def decrypt(archive, key, output):
    if output.exists():
        raise ValueError("El archivo de salida ya existe; no se sobrescribió.")
    with tempfile.TemporaryDirectory(prefix="ecommerce-decrypt-") as work:
        compressed = Path(work) / "verified.sql.gz"
        quiet_run(["openssl", "cms", "-decrypt", "-binary", "-inform", "DER",
                   "-in", str(archive), "-inkey", str(key), "-out", str(compressed)], stdout=subprocess.DEVNULL)
        # Do not expose partial plaintext if authentication or gzip validation fails.
        sql = Path(work) / "verified.sql"
        with gzip.open(compressed, "rb") as source, sql.open("wb") as target:
            shutil.copyfileobj(source, target)
        with output.open("xb") as target:
            os.fchmod(target.fileno(), 0o600)
            with sql.open("rb") as source:
                shutil.copyfileobj(source, target)
    print("Copia descifrada y autenticada.")


def restore(archive, key):
    with tempfile.TemporaryDirectory(prefix="ecommerce-restore-") as work:
        directory = Path(work)
        database = config(directory, "RESTORE_DATABASE_URL")
        if not database.endswith("_restore"):
            raise ValueError("Por seguridad, la base destino debe terminar en _restore y estar vacía.")
        count = quiet_run(client(directory, "mysql", "-N", "-B", database, "-e",
                         "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()"),
                         stdout=subprocess.PIPE).stdout.strip()
        if count != b"0":
            raise ValueError("La base destino no está vacía. No se modificó.")
        sql = directory / "restore.sql"
        decrypt(archive, key, sql)
        with sql.open("rb") as source:
            quiet_run(client(directory, "mysql", "--binary-mode", database), stdin=source, stdout=subprocess.DEVNULL)
        # Backups contain session rows; never reactivate saved login sessions.
        quiet_run(client(directory, "mysql", database, "-e", "DELETE FROM sessions"), stdout=subprocess.DEVNULL)
    print("Copia recuperada en la base vacía _restore. Producción no fue modificada.")


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    backup = commands.add_parser("create")
    backup.add_argument("--output", type=Path, default=Path("backup-output"))
    backup.add_argument("--recipient", type=Path, default=ROOT / "recipient.pem")
    for name in ["decrypt", "restore"]:
        action = commands.add_parser(name)
        action.add_argument("archive", type=Path)
        action.add_argument("--key", type=Path, required=True)
        if name == "decrypt":
            action.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.command == "create":
            create(args.output, args.recipient)
        elif args.command == "decrypt":
            decrypt(args.archive, args.key, args.output)
        else:
            restore(args.archive, args.key)
    except Exception as error:
        if isinstance(error, (ValueError, RuntimeError)):
            print(str(error), file=sys.stderr)
        else:
            print("Falló el respaldo o la recuperación. No se muestran datos ni credenciales.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

