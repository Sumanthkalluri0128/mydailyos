const mongoose=require('mongoose');
const s=new mongoose.Schema({userId:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},date:{type:String,required:true},weightKg:{type:Number,required:true,min:1},notes:{type:String,default:''}},{timestamps:true});
s.index({userId:1,date:1});
module.exports=mongoose.model('WeightLog',s);
