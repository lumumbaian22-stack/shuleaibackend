exports.getSupportConfig = (req, res) => {
  res.json({
    success: true,
    data: {
      whatsapp: process.env.SUPPORT_WHATSAPP || '254700000000',
      email: process.env.SUPPORT_EMAIL || 'support@shuleai.com'
    }
  });
};
