const express=require('express');const User=require('../models/User');const Profile=require('../models/Profile');const {requireAuth}=require('../middleware/auth');
const router=express.Router();router.use(requireAuth);
router.get('/me',async(req,res)=>{const u=await User.findById(req.user.id).select('_id name email createdAt');res.json({success:true,user:u});});
router.delete('/me',async(req,res)=>{try{const id=req.user.id;for(const n of ['Profile','WeightLog','WaterLog','Task','Habit','HabitLog','FoodLog','ActivityLog']){const M=require(`../models/${n}`);await M.deleteMany({userId:id});}await User.deleteOne({_id:id});res.json({success:true,message:'Account deleted successfully'});}catch(e){res.status(500).json({success:false,message:e.message});}});
module.exports=router;
