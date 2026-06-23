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

  User.prototype.generateAuthToken = function(effectiveRole = null) {
    const role = effectiveRole || this.role;
    return jwt.sign(
      { id: this.id, role, effectiveRole: role, primaryRole: this.role, schoolCode: this.schoolCode },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );
  };

  User.prototype.getPublicProfile = function(effectiveRole = null) {
    const primaryRole = this.getDataValue('primaryRole') || this.role;
    const role = effectiveRole || this.role;
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      role,
      primaryRole,
      phone: this.phone,
      profileImage: this.preferences?.profileImageUrl || this.profileImage || this.profilePicture || this.preferences?.profileImageDataUrl,
      profilePicture: this.preferences?.profileImageUrl || this.profilePicture || this.profileImage || this.preferences?.profileImageDataUrl,
      preferences: this.preferences || {},
      signature: this.preferences?.signatureUrl || this.preferences?.signatureAbsoluteUrl || this.preferences?.signatureDataUrl || null,
      signatureUrl: this.preferences?.signatureUrl || this.preferences?.signatureAbsoluteUrl || this.preferences?.signatureDataUrl || null,
      schoolCode: this.schoolCode,
      isActive: this.isActive,
      firstLogin: this.firstLogin,
      mustChangePassword: this.mustChangePassword
    };
  };

  return User;
};
