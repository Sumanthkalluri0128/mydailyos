const express=require('express');const Food=require('../models/Food');const router=express.Router();
router.get('/',async(req,res)=>{const filter={};if(req.query.search)filter.$or=[{name:{$regex:req.query.search,$options:'i'}},{brand:{$regex:req.query.search,$options:'i'}}];if(req.query.favorites==='true')filter.isFavorite=true;res.json({success:true,foods:await Food.find(filter).sort({name:1})});});
router.get('/:id',async(req,res)=>{const food=await Food.findById(req.params.id);if(!food)return res.status(404).json({success:false,message:'Food not found'});res.json({success:true,food});});
router.post('/',async(req,res)=>{try{const food=await Food.create(req.body);res.status(201).json({success:true,food});}catch(e){res.status(400).json({success:false,message:e.message});}});
router.put('/:id',async(req,res)=>{const food=await Food.findByIdAndUpdate(req.params.id,req.body,{new:true,runValidators:true});if(!food)return res.status(404).json({success:false,message:'Food not found'});res.json({success:true,food});});
router.patch('/:id/favorite',async(req,res)=>{const food=await Food.findById(req.params.id);if(!food)return res.status(404).json({success:false,message:'Food not found'});food.isFavorite=!food.isFavorite;await food.save();res.json({success:true,food});});
module.exports=router;
