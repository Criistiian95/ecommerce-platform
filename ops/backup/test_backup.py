import gzip
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from backup import config, create, decrypt, restore


class BackupTests(unittest.TestCase):
    def test_backup_rejects_other_database_before_access(self):
        with tempfile.TemporaryDirectory() as work, patch.dict(os.environ, {
            "BACKUP_DATABASE_URL": "mysql://u:p@h/railway"
        }), patch("backup.subprocess.Popen") as command:
            with self.assertRaisesRegex(ValueError, "solo admite"):
                create(Path(work) / "out", Path("missing.pem"))
            command.assert_not_called()

    def test_url_and_option_file_escape_without_logging_secrets(self):
        with tempfile.TemporaryDirectory() as work, patch.dict(os.environ, {
            "BACKUP_DATABASE_URL": "mysql://reader:p%22a%5Css@localhost:3306/ecommerce"
        }):
            self.assertEqual(config(Path(work), "BACKUP_DATABASE_URL"), "ecommerce")
            text = (Path(work) / "client.cnf").read_text()
            self.assertIn('password="p\\"a\\\\ss"', text)
            self.assertIn("ssl-mode=REQUIRED", text)
            self.assertEqual((Path(work) / "client.cnf").stat().st_mode & 0o777, 0o600)

    def test_rejects_invalid_database_and_option_injection(self):
        for value in ["mysql://u:p@h/db%0Aevil", "mysql://u:p%0Aevil@h/db", "https://u:p@h/db"]:
            with tempfile.TemporaryDirectory() as work, patch.dict(os.environ, {"BACKUP_DATABASE_URL": value}):
                with self.assertRaises(ValueError):
                    config(Path(work), "BACKUP_DATABASE_URL")

    def test_restore_rejects_production_name_before_access(self):
        with patch.dict(os.environ, {"RESTORE_DATABASE_URL": "mysql://u:p@h/railway"}):
            with self.assertRaisesRegex(ValueError, "_restore"):
                restore(Path("missing.cms"), Path("missing.pem"))

    def test_authenticated_roundtrip_and_corruption(self):
        with tempfile.TemporaryDirectory() as work:
            d = Path(work)
            def run(*args):
                subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            run("openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", str(d / "key"),
                "-out", str(d / "cert"), "-days", "1", "-subj", "/CN=test")
            data = "INSERT INTO products VALUES ('00000001','Prueba Ñ');".encode()
            (d / "sql.gz").write_bytes(gzip.compress(data))
            run("openssl", "cms", "-encrypt", "-aes-256-gcm", "-binary", "-outform", "DER", "-in", str(d / "sql.gz"),
                "-out", str(d / "backup"), "-recip", str(d / "cert"), "-keyopt", "rsa_padding_mode:oaep", "-keyopt", "rsa_oaep_md:sha256")
            decrypt(d / "backup", d / "key", d / "result")
            self.assertEqual((d / "result").read_bytes(), data)
            with self.assertRaises(ValueError):
                decrypt(d / "backup", d / "key", d / "result")
            tampered = bytearray((d / "backup").read_bytes())
            tampered[-10] ^= 1
            (d / "corrupt").write_bytes(tampered)
            with self.assertRaises(RuntimeError):
                decrypt(d / "corrupt", d / "key", d / "bad-result")
            self.assertFalse((d / "bad-result").exists())


if __name__ == "__main__":
    unittest.main()

