const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: { len: [2, 100] }
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      validate: { isEmail: true }
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false
    },
    role: {
      type: DataTypes.ENUM('super_admin', 'admin', 'finance_officer', 'teacher', 'parent', 'student'),
      allowNull: false
    },
    phone: DataTypes.STRING,
    schoolCode: {
      type: DataTypes.STRING,
      allowNull: true
    },
    profileImage: DataTypes.TEXT,
    profilePicture: DataTypes.TEXT,
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    lastLogin: DataTypes.DATE,
    firstLogin: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    mustChangePassword: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    passwordIssuedAt: DataTypes.DATE,
    preferences: {
      type: DataTypes.JSONB,
      defaultValue: {
        notifications: { email: true, sms: false, push: true },
        theme: 'light'
      }
    }
  }, {
    timestamps: true,
    hooks: {
      beforeSave: async (user) => {
        if (user.changed('password')) {
          const salt = await bcrypt.genSalt(10);
          user.password = await bcrypt.hash(user.password, salt);
        }
      }
    }
  });

  User.prototype.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
  };

  User.prototype.generateAuthToken = function() {
    return jwt.sign(
      { id: this.id, role: this.role, schoolCode: this.schoolCode },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );
  };

  User.prototype.getPublicProfile = function() {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      role: this.role,
      phone: this.phone,
      profileImage: this.preferences?.profileImageDataUrl || this.profileImage || this.profilePicture,
      profilePicture: this.preferences?.profileImageDataUrl || this.profilePicture || this.profileImage,
      preferences: this.preferences || {},
      signature: this.preferences?.signatureDataUrl || this.preferences?.signatureUrl || this.preferences?.signatureAbsoluteUrl || null,
      signatureUrl: this.preferences?.signatureDataUrl || this.preferences?.signatureUrl || this.preferences?.signatureAbsoluteUrl || null,
      schoolCode: this.schoolCode,
      isActive: this.isActive,
      firstLogin: this.firstLogin,
      mustChangePassword: this.mustChangePassword
    };
  };

  return User;
};
