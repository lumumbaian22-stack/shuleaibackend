const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { School } = require('../models');

// @desc    Get school settings
// @route   GET /api/settings/school
// @access  Private
router.get('/school', protect, async (req, res) => {
  try {
    const school = await School.findOne({ 
      where: { code: req.user.schoolCode } 
    });
    
    if (!school) {
      return res.status(404).json({ 
        success: false, 
        message: 'School not found' 
      });
    }

    // Return default settings structure that frontend expects
    res.json({
      curriculum: school.system || 'cbc',
      schoolName: school.name,
      schoolLevel: 'secondary', // You can determine this from grades
      terms: [
        { name: 'Term 1', startDate: '2024-01-15', endDate: '2024-04-12' },
        { name: 'Term 2', startDate: '2024-05-06', endDate: '2024-08-09' },
        { name: 'Term 3', startDate: '2024-09-02', endDate: '2024-11-29' }
      ],
      customSubjects: []
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// @desc    Update school settings
// @route   POST /api/settings/school
// @access  Private/Admin
router.post('/school', protect, async (req, res) => {
  try {
    const school = await School.findOne({ 
      where: { code: req.user.schoolCode } 
    });
    
    if (!school) {
      return res.status(404).json({ 
        success: false, 
        message: 'School not found' 
      });
    }

    // Update school settings
    if (req.body.curriculum) {
      school.system = req.body.curriculum;
    }
    if (req.body.schoolName) {
      school.name = req.body.schoolName;
    }
    
    await school.save();

    res.json({
      success: true,
      settings: {
        curriculum: school.system,
        schoolName: school.name,
        schoolLevel: req.body.schoolLevel || 'secondary',
        terms: req.body.terms || [
          { name: 'Term 1', startDate: '2024-01-15', endDate: '2024-04-12' },
          { name: 'Term 2', startDate: '2024-05-06', endDate: '2024-08-09' },
          { name: 'Term 3', startDate: '2024-09-02', endDate: '2024-11-29' }
        ],
        customSubjects: req.body.customSubjects || []
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

module.exports = router;
