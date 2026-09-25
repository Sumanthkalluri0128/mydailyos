require('dotenv').config();
const express=require('express');const mongoose=require('mongoose');const cors=require('cors');
const authRoutes=require('./routes/authRoutes');const accountRoutes=require('./routes/accountRoutes');const profileRoutes=require('./routes/profileRoutes');const foodRoutes=require('./routes/foodRoutes');const foodLogRoutes=require('./routes/foodLogRoutes');const activityRoutes=require('./routes/activityRoutes');const taskRoutes=require('./routes/taskRoutes');const habitRoutes=require('./routes/habitRoutes');const waterRoutes=require('./routes/waterRoutes');const weightRoutes=require('./routes/weightRoutes');
const app=express();const PORT=Number(process.env.PORT)||5001;
const allowedOrigins=['http://localhost:5173',process.env.CLIENT_URL].filter(Boolean);app.use(cors({origin:(origin,cb)=>!origin||allowedOrigins.includes(origin)?cb(null,true):cb(new Error('CORS blocked'))}));app.use(express.json());
app.get('/api/health',(req,res)=>res.json({success:true,status:'healthy',service:'MyDailyOS API',timestamp:new Date().toISOString()}));
app.use('/api/auth',authRoutes);app.use('/api/account',accountRoutes);app.use('/api/profile',profileRoutes);app.use('/api/foods',foodRoutes);app.use('/api/food-logs',foodLogRoutes);app.use('/api/activities',activityRoutes);app.use('/api/tasks',taskRoutes);app.use('/api/habits',habitRoutes);app.use('/api/water',waterRoutes);app.use('/api/weight',weightRoutes);
app.get('/',(req,res)=>res.json({message:'MyDailyOS API is running 🚀'}));
mongoose.connect(process.env.MONGO_URI).then(()=>app.listen(PORT,'0.0.0.0',()=>console.log(`MyDailyOS server running on port ${PORT}`))).catch(e=>{console.error('MongoDB connection failed',e);process.exit(1);});
