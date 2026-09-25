const express=require('express');const Profile=require('../models/Profile');const {requireAuth}=require('../middleware/auth');const router=express.Router();router.use(requireAuth);
router.get('/',async(req,res)=>{let p=await Profile.findOne({userId:req.user.id});if(!p)p=await Profile.create({userId:req.user.id});res.json({success:true,profile:p});});
router.patch('/',async(req,res)=>{const allowed=['name','age','sex','heightCm','currentWeightKg','activityLevel','goals'];const update={};for(const k of allowed)if(req.body[k]!==undefined)update[k]=req.body[k];let p=await Profile.findOneAndUpdate({userId:req.user.id},{$set:update},{new:true,upsert:true,setDefaultsOnInsert:true});res.json({success:true,profile:p});});
module.exports=router;
