const mongoose=require('mongoose');
const s=new mongoose.Schema({name:{type:String,required:true,trim:true},category:{type:String,required:true,trim:true},met:{type:Number,required:true,min:0},description:{type:String,default:''},isFavorite:{type:Boolean,default:false},muscles:{type:[String],default:[]}},{timestamps:true});module.exports=mongoose.model('Activity',s);
