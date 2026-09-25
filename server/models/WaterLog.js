const mongoose=require('mongoose');
module.exports=mongoose.model('WaterLog',new mongoose.Schema({userId:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},date:{type:String,required:true},amountMl:{type:Number,required:true,min:1},notes:{type:String,default:''}},{timestamps:true}));
