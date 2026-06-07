const { Op }=require('sequelize');
const { BirthdayEvent, Student, User }=require('../models');
const birthdayService=require('../services/birthdayService');
exports.process=async(req,res)=>{try{res.json({success:true,message:'Birthday reminders processed with duplicate prevention.',data:await birthdayService.processSchool(req.user.schoolCode,{createdBy:req.user.id})});}catch(error){res.status(500).json({success:false,message:error.message});}};
exports.upcoming=async(req,res)=>{try{const from=new Date().toISOString().slice(0,10),until=new Date(Date.now()+Math.min(Number(req.query.days||30),366)*86400000).toISOString().slice(0,10);const rows=await BirthdayEvent.findAll({where:{schoolCode:req.user.schoolCode,eventDate:{[Op.between]:[from,until]}},include:[{model:Student,include:[{model:User,attributes:['id','name','profileImage']}]}],order:[['eventDate','ASC']]});res.json({success:true,data:rows});}catch(error){res.status(500).json({success:false,message:error.message});}};
