const express = require('express');
const cors = require('cors')
require('dotenv').config({ path: '.env.local' });
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;
const stripe = require('stripe')(process.env.STRIPE);
const crypto = require('crypto')


// Middleware
app.use(cors());
app.use(express.json())


const admin = require("firebase-admin");
const { log } = require('console');
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});



const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).send({ message: 'unauthorize access' })
  }

  try {
    const idToken = token.split(' ')[1]
    const decoded = await admin.auth().verifyIdToken(idToken)
    // console.log('decodec info', decoded);
    req.decoded_email = decoded.email;
    next()
  }
  catch (error) {
    return res.status(401).send({ message: 'unauthorize access' })
  }
}
//

// const serviceAccount = require("./firebase-admin-key.json");


const uri = process.env.URI

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

    const database = client.db('RedHopeDB')
    const userCollections = database.collection('user')
    const donationReqCol = database.collection('donationReqCol')
    const fundDonatorCollection = database.collection('fundDonators')



    //  Registered User Info storing
    app.post('/users', async (req, res) => {
      const userInfo = req.body;
      userInfo.role = "donor";
      userInfo.status = "Active"
      userInfo.createdAt = new Date();
      const result = await userCollections.insertOne(userInfo);
      res.send(result)
    })

    // Get All Users
    app.get('/users', verifyFBToken, async (req, res) => {
      const result = await userCollections.find().toArray()
      res.status(200).send(result)
    })


    //   get api for user's email 
    app.get('/users/role/:email', async (req, res) => {
      const { email } = req.params
      const query = { email: email }
      const result = await userCollections.findOne(query)
      // console.log(result);
      res.send(result)
    })

    // get my donation request 
    app.get('/my-donation-request', verifyFBToken, async (req, res) => {
      const emial = req.decoded_email;
      // const limit = Number(req.query.limit)
      // const skip = Number(req.query.skip)
      const size = Number(req.query.size)
      const page = Number(req.query.page)

      const query = { requesterEmail: emial };


      const result = await donationReqCol
        .find(query)
        .limit(size)
        .skip(size * page)
        .toArray();

      const totalRequest = await donationReqCol.countDocuments(query)

      res.send({ request: result, totalRequest })
    })

    // post create donation request 
    app.post('/create-donaiton-request', verifyFBToken, async (req, res) => {
      const data = req.body;
      data.createdAt = new Date();
      const result = await donationReqCol.insertOne(data)
      res.send(result);
    })

    // patch method for changeing status
    app.patch('/update/user/status', verifyFBToken, async (req, res) => {
      const { email, status } = req.query;
      const query = { email: email };

      const updateStatus = { $set: { status: status } }
      const result = await userCollections.updateOne(query, updateStatus)
      res.send(result)
    })

    // payment Stripe
    app.post('/create-payment-checkout', async (req, res) => {
      const information = req.body
      const amount = parseInt(information.donateAmount) * 100
      const donorName = information.donorName
      const donorEmail = information.donorEmail
      // information.createdAt = new Date();

      // const result = await FundDonatorsList.insertOne(information)


      const session = await stripe.checkout.sessions.create({

        line_items: [
          {
            price_data: {
              currency: 'usd',
              unit_amount: amount,
              product_data: {
                name: 'Donate'
              }

            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        metadata: {
          donorName: donorName
        },
        customer_email: donorEmail,
        success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/payment-cancelled`,
      });

      res.send({ url: session.url })

    })


    // Post Fund Donators Information 
    app.post('/success-payment', async (req, res) => {
      const { session_id } = req.query;
      // console.log(session_id);
      const session = await stripe.checkout.sessions.retrieve(session_id);
       console.log(session);

      const transactionId = session.payment_intent;



      if (session.payment_status == 'paid') {
        const paymentInfo = {
          amount: session.amount_total / 100,
          currency: session.currency,
          donorEmail: session.customer_email,
          donorName: session.metadata.donorName,
          transactionId,
          time: new Date(),

        }

        const result = await fundDonatorCollection.insertOne(paymentInfo)
        return res.send(result)
      }

    })


    // Get Pending Donation request
    app.get('/pending-donations', verifyFBToken, async (req, res) => {
     

      const query = { donationStatus: "pending" }
      
      const result = await donationReqCol.find(query).toArray()
      
      res.send(result)
      
    })

    // get search with filters
    app.get('/search', async (req, res) => {
      const { bloodGroup, recipientDistrict, recipientUpazila } = req.query;


      const query = {}
      if (!query) {
        return;
      }
      if (bloodGroup) {
        query.blood = bloodGroup.replace(/ /g, "+").trim();
      }
      if (recipientDistrict) {
        query.district = recipientDistrict
      }
      if (recipientUpazila) {
        query.upazila = recipientUpazila
      }

      console.log(query);

      const result = await userCollections.find(query).toArray();
      res.send(result)
    })

    // Get Request for donation request details page
    app.get('/donation-request-details/:_id', verifyFBToken, async (req, res) => {
      const { _id } = req.params;
      const query = { _id: new ObjectId(_id) }
      const result = await donationReqCol.findOne(query)
      res.send(result)
    })

    // Patch for updating the Status
    app.patch('/update/donation/status', async (req, res) => {
      const { _id } = req.query;
      const query = { _id: new ObjectId(_id) }
      
      const updateStatus = { $set: { donationStatus: "inprogress" } }
      const result = await donationReqCol.updateOne(query, updateStatus)
      
      res.send(result)  
    })

    // Get List of Fund Donator
    app.get('/fund-donators', async (req, res) => {
      const result = await fundDonatorCollection.find().toArray()
      res.send(result)
    })


    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello world')
})

app.listen(port, () => {
  console.log(`users server started on port: ${port}`);

})


