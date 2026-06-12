-- SQL Schema Setup for XMLBoot

-- 1. Tabla de usuarios para el panel
CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL, -- Hashed con bcrypt/password_hash en PHP
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabla para monitorear las sesiones de scraping en segundo plano y captcha manual
CREATE TABLE IF NOT EXISTS sat_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rfc VARCHAR(20) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'creado', -- 'esperando_captcha', 'iniciado', 'descargando', 'completado', 'error'
  total_xml INT DEFAULT 0,
  xml_descargados INT DEFAULT 0,
  progreso INT DEFAULT 0,
  captcha_base64 LONGTEXT NULL,
  error_message TEXT NULL,
  fecha_inicio DATE NULL,
  fecha_fin DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Alterar la tabla facturas para incluir el tipo de comprobante
ALTER TABLE facturas ADD COLUMN tipo_comprobante VARCHAR(10) NULL AFTER uso_cfdi;

-- 4. Insertar un usuario administrador inicial para pruebas (password: admin123)
-- El hash de password es generado con password_hash('admin123', PASSWORD_BCRYPT)
INSERT INTO usuarios (email, password)
VALUES ('admin@xmlboot.com', '$2y$10$y.Zc3qR.hWjFz5nL.7pIzeHsh92k3kC.iS8U.Z1215bK2tM7K03l.')
ON DUPLICATE KEY UPDATE email=email;

-- 5. Tabla de contribuyentes (clientes del despacho)
CREATE TABLE IF NOT EXISTS contribuyentes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rfc VARCHAR(13) NOT NULL UNIQUE,
  razon_social VARCHAR(255) NOT NULL,
  ciec_password VARCHAR(255) NOT NULL,
  cer_file VARCHAR(255) NULL,
  key_file VARCHAR(255) NULL,
  private_key_password VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Tabla de documentos SAT (Constancias y Opiniones)
CREATE TABLE IF NOT EXISTS documentos_sat (
  id INT AUTO_INCREMENT PRIMARY KEY,
  contribuyente_id INT NOT NULL,
  tipo_documento VARCHAR(50) NOT NULL, -- 'constancia', 'opinion'
  file_name VARCHAR(255) NOT NULL,
  fecha_descarga TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contribuyente_id) REFERENCES contribuyentes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
