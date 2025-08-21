const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const app = express();
const cookieParser = require('cookie-parser')
require('dotenv').config();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');


app.use(cors({
    origin: ['http://localhost:5173'],
    credentials: true

}));
app.use(express.json());
app.use(cookieParser());

const logger = (req, res, next) =>{
    console.log('inside the logger')
    next();
}

const verifyToken = (req, res, next) => {
    console.log('inside verify token middleware', req.cookies);
    const token = req?.cookies?.token;
    if(!token){
        return res.status(401).send({message: 'Unauthorized token'})
    }
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) =>{
        if(err){
            return res.status(401).send({message: 'UnAuthorized Access'})
        }
        req.user = decoded;
        next();
    })
    
}




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hpxccpu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");

        //Auth Related APIs
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.JWT_SECRET , {expiresIn: '1h'});
            res
            .cookie('token', token,{
                httpOnly: true,
                secure: false,

            }) 
            .send({success: true});
        })



        //jobs related apis
        const jobsCollection = client.db('jobPortal').collection('jobs');
        const jobApplicationCollection = client.db('jobPortal').collection('job-Applications');

        app.get('/jobs', logger,  async (req, res) => {
            console.log('now inside the api callback')
            const email = req.query.email;
            let query = {};
            if (email) {
                query = { hr_email: email };
            }
            const cursor = jobsCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        })


        app.get('/jobs/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await jobsCollection.findOne(query);
            res.send(result);
        })

        app.post('/jobs', async (req, res) => {
            const newJob = req.body;
            const result = await jobsCollection.insertOne(newJob);
            res.send(result);
        })

        //job application apis

        app.get('/job-applications', verifyToken, async (req, res) => {
            let query = {};
            if (req.query.email) {
                query = { applicant_email: req.query.email };
            }


            if(req.user.email != req.query.email ){
                return res.status(403).send({message: 'forbidden access'});
            }
            console.log('Cuk cuk tokoto', req.cookies)

            const result = await jobApplicationCollection.find(query).toArray();

            //Not the best way to aggregate data
            for (const application of result) {
                console.log(application.job_id);
                const query2 = { _id: new ObjectId(application.job_id) }
                const result2 = await jobsCollection.findOne(query2);
                if (result2) {
                    application.title = result2.title;
                    application.company = result2.company;
                    application.location = result2.location;
                    application.company_logo = result2.company_logo;
                }
            }

            res.send(result);
        })

        app.get('/job-applications/jobs/:job_id', async (req, res) => {
            const jobId = req.params.job_id;
            const query = { job_id: jobId }
            const result = await jobApplicationCollection.find(query).toArray();
            res.send(result);
        })


        app.post('/job-applications', async (req, res) => {
            const application = req.body;
            const result = await jobApplicationCollection.insertOne(application);

            //Not the best way to aggregate data
            const id = application.job_id;
            const query = { _id: new ObjectId(id) }
            const job = await jobsCollection.findOne(query);
            let newCount = 0;
            if (job.applicationCount) {
                newCount = job.applicationCount + 1;
            } else {
                newCount = 1;
            }

            //NOW update the job info
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    applicationCount: newCount
                },
            }
            const updateResult = await jobsCollection.updateOne(filter, updatedDoc);

            res.send(result);

        })

        app.patch('/job-applications/:id', async (req, res) => {  
            const id = req.params.id;
            const data = req.body;
            const filter = { _id: new ObjectId(id) };   
            const updatedDoc={
                $set: {
                    status: data.status
                }
            }
            const result = await jobApplicationCollection.updateOne(filter, updatedDoc);
            res.send(result);
          })




    } finally {
        // Ensures that the client will close when you finish/error
        //await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Job is falling from the sky!');
})

app.listen(port, () => {
    console.log(`Server is running on ${port}`);
})