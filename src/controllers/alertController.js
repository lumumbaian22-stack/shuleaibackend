exports.updateMark = async (req, res) => {
  try {
    const { recordId } = req.params;
    const { score, assessmentName, date } = req.body;
    const record = await AcademicRecord.findByPk(recordId);
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    await record.update({ score, assessmentName, date });
    res.json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteMark = async (req, res) => {
  try {
    const { recordId } = req.params;
    const record = await AcademicRecord.findByPk(recordId);
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    await record.destroy();
    res.json({ success: true, message: 'Mark deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
