const mongoose=require('mongoose');
const profileSchema=new mongoose.Schema({
  userId:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true,unique:true},
  name:{type:String,default:'',trim:true},age:{type:Number,min:1,max:120,default:null},
  sex:{type:String,enum:['male','female','other',''],default:''},heightCm:{type:Number,min:50,max:250,default:null},
  currentWeightKg:{type:Number,min:1,max:500,default:null},activityLevel:{type:String,enum:['sedentary','light','moderate','very_active','extra_active'],default:'moderate'},
  goals:{calorieTarget:{type:Number,min:1,default:1800},proteinTarget:{type:Number,min:1,default:140},waterTargetMl:{type:Number,min:1,default:3000},stepsTarget:{type:Number,min:1,default:10000},targetWeightKg:{type:Number,min:1,default:null}}
},{timestamps:true});
module.exports=mongoose.model('Profile',profileSchema);
