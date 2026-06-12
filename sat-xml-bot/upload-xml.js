app.post('/upload-xml', upload.single('xml'), async (req, res) => {

  try {

    const xmlContent = await fs.readFile(req.file.path);

    const parser = new xml2js.Parser({
      explicitArray: false
    });

    const result = await parser.parseStringPromise(xmlContent);

    const comprobante = result['cfdi:Comprobante'];

    const emisor = comprobante['cfdi:Emisor'];

    const receptor = comprobante['cfdi:Receptor'];

    const complemento = comprobante['cfdi:Complemento'];

    const timbre = complemento['tfd:TimbreFiscalDigital'];

    const uuid = timbre.$.UUID;

    const total = comprobante.$.Total;

    const connection = await getConnection();

    await connection.execute(`
      INSERT INTO facturas (
        uuid,
        emisor,
        receptor,
        total
      )
      VALUES (?, ?, ?, ?)
    `, [
      uuid,
      emisor.$.Nombre,
      receptor.$.Nombre,
      total
    ]);

    await connection.end();

    await fs.remove(req.file.path);

    res.json({
      ok: true,
      mensaje: 'XML procesado correctamente 🚀'
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      ok: false,
      error: error.message
    });

  }

});