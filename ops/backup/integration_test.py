"""Disposable MySQL 8.4 round trip. Never connects to Railway."""
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import time
from backup import create, restore


password = secrets.token_hex(24)
name = "ecommerce-backup-test-" + secrets.token_hex(5)
os.environ["MYSQL_ROOT_PASSWORD"] = password
os.environ["MYSQL_PWD"] = password


def run(*args, **kwargs):
    return subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, **kwargs).stdout


def sql(statement, database=None):
    command = ["docker", "exec", "-i", "-e", "MYSQL_PWD", name, "mysql", "-uroot", "-N", "-B"]
    if database:
        command.append(database)
    return run(*command, input=statement.encode())


try:
    run("docker", "run", "-d", "--name", name, "-p", "127.0.0.1::3306", "-e", "MYSQL_ROOT_PASSWORD",
        "-e", "MYSQL_ROOT_HOST=%", "mysql:8.4")
    for attempt in range(60):
        try:
            sql("SELECT 1")
            break
        except subprocess.CalledProcessError:
            time.sleep(2)
    else:
        raise RuntimeError("MySQL de prueba no inició.")
    port = run("docker", "port", name, "3306").decode().strip().rsplit(":", 1)[1]
    sql("CREATE DATABASE ecommerce; CREATE DATABASE ecommerce_restore;")
    # Load the actual application schema, constraints and seed data.
    os.environ["DATABASE_URL"] = f"mysql://root:{password}@127.0.0.1:{port}/ecommerce"
    run("node", "backend/dist/database/migrate.js")
    sql("""
        INSERT INTO commerces(id,name,slug,created_at,updated_at,logo_data,logo_mime_type)
        VALUES ('c1','Prueba Ñ','prueba',NOW(),NOW(),X'00FF1020','image/png');
        INSERT INTO users(id,commerce_id,email,password_hash,name,role,created_at,updated_at)
        VALUES ('u1','c1','test@example.invalid','test-only','Prueba','admin',NOW(),NOW());
        INSERT INTO products(id,commerce_id,sku,name,price,image_data,image_mime_type,created_at,updated_at)
        VALUES ('p1','c1','SKU1','Producto Ñ',123.45,X'00FFAB0012','image/png',NOW(),NOW());
        INSERT INTO sessions(id,user_id,expires_at,created_at,updated_at)
        VALUES ('s1','u1','2030-01-01',NOW(),NOW());
    """, "ecommerce")
    with tempfile.TemporaryDirectory() as work:
        directory = Path(work)
        run("openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", str(directory / "key"),
            "-out", str(directory / "cert"), "-days", "1", "-subj", "/CN=test")
        os.environ["BACKUP_DATABASE_URL"] = os.environ["DATABASE_URL"]
        create(directory / "out", directory / "cert")
        archive = next((directory / "out").glob("*.cms"))
        os.environ["RESTORE_DATABASE_URL"] = f"mysql://root:{password}@127.0.0.1:{port}/ecommerce_restore"
        restore(archive, directory / "key")
        tables = sql("SHOW TABLES", "ecommerce").decode().split()
        assert set(tables) == set(sql("SHOW TABLES", "ecommerce_restore").decode().split())
        for table in tables:
            if table == "sessions":
                assert sql("SELECT COUNT(*) FROM sessions", "ecommerce_restore").strip() == b"0"
                continue
            assert sql(f"SHOW CREATE TABLE {table}", "ecommerce") == sql(f"SHOW CREATE TABLE {table}", "ecommerce_restore"), table
            assert sql(f"SELECT * FROM {table} ORDER BY 1", "ecommerce") == sql(f"SELECT * FROM {table} ORDER BY 1", "ecommerce_restore"), table
        assert sql("SELECT COUNT(*) FROM sessions", "ecommerce").strip() == b"1"
        try:
            restore(archive, directory / "key")
        except ValueError:
            pass
        else:
            raise AssertionError("No se rechazó una base destino no vacía")
    print("OK: esquema real y datos ficticios recuperados; destino no vacío rechazado.")
finally:
    subprocess.run(["docker", "rm", "-fv", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

