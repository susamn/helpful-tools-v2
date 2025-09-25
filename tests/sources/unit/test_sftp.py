
import unittest
from unittest.mock import patch, MagicMock, ANY
from datetime import datetime
import stat

from src.sources.base import SourceConfig
from src.sources.sftp import SftpSource
from src.sources.exceptions import SourceConfigurationError, SourceAuthenticationError, SourceConnectionError, SourceNotFoundError, SourcePermissionError, SourceDataError

class TestSftpSource(unittest.TestCase):
    def setUp(self):
        self.config = SourceConfig(
            source_id='test_sftp',
            name='Test SFTP',
            source_type='sftp',
            static_config={
                'host': 'localhost',
                'username': 'user',
                'password': 'password'
            },
            path_template='sftp://localhost/remote/path',
            dynamic_variables={},
            created_at=datetime.now(),
            updated_at=datetime.now()
        )

    def test_parse_sftp_url(self):
        source = SftpSource(self.config)
        self.assertEqual(source._parsed_url['host'], 'localhost')
        self.assertEqual(source._parsed_url['path'], '/remote/path')

    def test_parse_sftp_url_with_port(self):
        config = self.config
        config.path_template = 'sftp://localhost:2222/remote/path'
        source = SftpSource(config)
        self.assertEqual(source._parsed_url['port'], 2222)

    def test_parse_sftp_url_no_host(self):
        config = self.config
        config.path_template = 'sftp:///remote/path'
        config.static_config = {}
        with self.assertRaises(SourceConfigurationError):
            SftpSource(config)

    def test_parse_sftp_url_invalid_scheme(self):
        config = self.config
        config.path_template = 'http://localhost/remote/path'
        with self.assertRaises(SourceConfigurationError):
            SftpSource(config)

    @patch('paramiko.SSHClient')
    def test_get_sftp_client_success(self, mock_ssh_client_class):
        source = SftpSource(self.config)
        mock_ssh_client = MagicMock()
        mock_ssh_client_class.return_value = mock_ssh_client
        sftp_client = source._get_sftp_client()
        mock_ssh_client.connect.assert_called_with(hostname='localhost', port=22, username='user', timeout=30, password='password')
        mock_ssh_client.open_sftp.assert_called_once()
        self.assertIsNotNone(sftp_client)

    @patch('paramiko.SSHClient')
    def test_test_connection_success(self, mock_ssh_client_class):
        source = SftpSource(self.config)
        mock_sftp_client = MagicMock()
        mock_attrs = MagicMock()
        mock_attrs.st_mode = 33188
        mock_sftp_client.stat.return_value = mock_attrs
        source._get_sftp_client = MagicMock(return_value=mock_sftp_client)
        result = source.test_connection()
        self.assertTrue(result.success)
        self.assertEqual(result.status, 'connected')

    @patch('paramiko.SSHClient')
    def test_get_metadata_success(self, mock_ssh_client_class):
        source = SftpSource(self.config)
        mock_sftp_client = MagicMock()
        mock_attrs = MagicMock()
        mock_attrs.st_mode = 33188
        mock_attrs.st_size = 1024
        mock_attrs.st_mtime = 1678886400
        mock_sftp_client.stat.return_value = mock_attrs
        source._get_sftp_client = MagicMock(return_value=mock_sftp_client)
        metadata = source.get_metadata()
        self.assertEqual(metadata.size, 1024)

    @patch('paramiko.SSHClient')
    def test_exists_success(self, mock_ssh_client_class):
        source = SftpSource(self.config)
        mock_sftp_client = MagicMock()
        source._get_sftp_client = MagicMock(return_value=mock_sftp_client)
        self.assertTrue(source.exists())
        mock_sftp_client.stat.assert_called_with('/remote/path')

    @patch('paramiko.SSHClient')
    def test_read_data_success(self, mock_ssh_client_class):
        source = SftpSource(self.config)
        mock_sftp_client = MagicMock()
        mock_file = MagicMock()
        mock_file.read.return_value = b'test data'
        mock_sftp_client.open.return_value.__enter__.return_value = mock_file
        mock_attrs = MagicMock()
        mock_attrs.st_mode = 33188
        mock_sftp_client.stat.return_value = mock_attrs
        source._get_sftp_client = MagicMock(return_value=mock_sftp_client)
        data = source.read_data()
        self.assertEqual(data, b'test data')

    @patch('paramiko.SSHClient')
    def test_write_data_success(self, mock_ssh_client_class):
        source = SftpSource(self.config)
        mock_sftp_client = MagicMock()
        mock_file = MagicMock()
        mock_sftp_client.open.return_value.__enter__.return_value = mock_file
        source._get_sftp_client = MagicMock(return_value=mock_sftp_client)
        result = source.write_data(b'test data')
        self.assertTrue(result)
        mock_file.write.assert_called_with(b'test data')

    @patch('paramiko.SSHClient')
    def test_list_contents_success(self, mock_ssh_client_class):
        source = SftpSource(self.config)
        mock_sftp_client = MagicMock()
        mock_attrs = MagicMock()
        mock_attrs.st_mode = 16877
        mock_sftp_client.stat.return_value = mock_attrs
        mock_item = MagicMock()
        mock_item.filename = 'test_file'
        mock_item.st_mode = 33188
        mock_item.st_size = 1024
        mock_item.st_mtime = 1678886400
        mock_sftp_client.listdir_attr.return_value = [mock_item]
        source._get_sftp_client = MagicMock(return_value=mock_sftp_client)
        contents = source.list_contents()
        self.assertEqual(len(contents), 1)
        self.assertEqual(contents[0]['name'], 'test_file')

if __name__ == '__main__':
    unittest.main()
