const express = require('express')
const app = express()
const MongoClient = require('mongodb').MongoClient;
const ObjectID = require('mongodb').ObjectID
const cors = require('cors')
const bodyParser = require('body-parser')
require('dotenv').config()

const port = process.env.PORT || 5000

app.use(cors())
app.use(bodyParser.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ejoil.mongodb.net/${process.env.DB_NAME}?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

client.connect(err => {
    console.log('connection err', err)
    const busCollection = client.db(process.env.DB_NAME).collection("buses");
    const scheduleCollection = client.db(process.env.DB_NAME).collection("schedules");
    const seatsCollection = client.db(process.env.DB_NAME).collection("seats")
    const bookingCollection = client.db(process.env.DB_NAME).collection("bookings")
    const adminCollection = client.db(process.env.DB_NAME).collection("admins")

    app.get('/buses', (req, res) => {
        busCollection.find({})
            .toArray((err, items) => {
                res.send(items)
            })
    })

    app.get('/places', (req, res) => {
        busCollection.find({})
            .toArray((err, items) => {
                let places = new Set()
                places.add('---')
                items.map(item => {
                    places.add(item.source)
                    places.add(item.destination)
                })
                places = Array.from(places)
                // console.log(places)
                res.send(places)
            })
    })

    app.get('/schedules', (req, res) => {
        scheduleCollection.find({})
            .toArray((err, items) => {
                res.send(items)
            })
    })

    app.get('/seats/:id', (req, res) => {
        console.log(req.params.id)
        scheduleCollection.find({ _id: ObjectID(req.params.id) })
            .toArray((err, buses) => {
                const bus = buses[0]
                seatsCollection.find({ scheduleId: ObjectID(req.params.id) })
                    .toArray((err, items) => {
                        let booked = items[0]?.booked
                        let seats = []
                        let row = 'A'
                        let col = 1
                        for (let i = 0; i < bus.bus.totalSeat; i++, col++) {

                            const seatNo = row + col
                            let seatStatus = 'white'
                            if (booked?.indexOf(seatNo) != -1)
                                seatStatus = 'secondary'
                            seats.push({
                                seat: seatNo,
                                seatStatus: seatStatus
                            })
                            if ((i + 1) % bus.bus.seatsPerRow === 0) {
                                row = String.fromCharCode(row.charCodeAt(0) + 1)
                                col = 0
                            }

                        }
                        console.log(seats)

                        res.send(seats)
                    })

            })


    })

    app.post('/addBus', (req, res) => {
        const newBus = req.body
        console.log('adding new bus:', newBus)
        busCollection.insertOne(newBus)
            .then(result => {
                console.log('inserted Count', result.insertedCount)
                res.send(result.insertedCount > 0)
            })
    })

    app.post('/addSchedule', (req, res) => {
        const newSchedule = req.body
        console.log('adding new schedule:', newSchedule)
        scheduleCollection.insertOne(newSchedule)
            .then(result => {
                // console.log('result', result.insertedId)
                // console.log('inserted Count', result.insertedCount)
                seatsCollection.insertOne({ scheduleId: result.insertedId, booked: [] })
                res.send(result.insertedCount > 0)
            })
    })

    app.post('/getSchedule', (req, res) => {
        const filter = req.body
        console.log('searching schedule:', filter)
        const { source, destination, date, coachType } = filter
        scheduleCollection.find({
            'bus.source': source,
            'bus.destination': destination,
            'bus.coachType': coachType

        })
            .toArray((err, items) => {
                // console.log(items)
                res.send(items)
            })
    })

    app.post('/addAdmin', (req, res) => {
        const newAdmin = req.body
        console.log('adding new admin:', newAdmin)
        adminCollection.insertOne(newAdmin)
            .then(result => {
                console.log('inserted Count', result.insertedCount)
                res.send(result.insertedCount > 0)
            })
    })

    app.post('/isAdmin', (req, res) => {
        const email = req.body.email
        adminCollection.find({ email: email })
            .toArray((err, admins) => {
                res.send(admins.length > 0)

            })
    })

    app.delete('/deleteBus/:id', (req, res) => {
        const id = ObjectID(req.params.id)
        console.log('delete this', id)
        busCollection.findOneAndDelete({ _id: id })
            .then(documents => res.send(!!documents.value))
    })

    app.patch('/updateBus/:id', (req, res) => {
        console.log(req.body)
        busCollection.updateOne({ _id: ObjectID(req.params.id) },
            {
                $set: { fare: req.body.fare }
            }
        )
            .then(result => {
                res.send(result.modifiedCount > 0)
            })
    })

    app.patch('/updateBookingStatus/:id', (req, res) => {
        console.log(req.body)
        bookingCollection.updateOne({ _id: ObjectID(req.params.id) },
            {
                $set: { status: req.body.status }
            }
        )
            .then(result => {
                res.send(result.modifiedCount > 0)
            })
    })

    app.post('/addBooking', (req, res) => {
        const booking = req.body
        console.log(booking)
        bookingCollection.insertOne(booking)
            .then(result => {
                console.log(result.insertedCount)

                let previousBooked = []

                seatsCollection.find({ scheduleId: ObjectID(booking.scheduleId) }).toArray((err, items) => {
                    previousBooked = [...items[0].booked, ...booking.seats]
                    seatsCollection.updateOne({ scheduleId: ObjectID(booking.scheduleId) },
                        {
                            $set: { booked: previousBooked }
                        })
                        .then(result => {
                            scheduleCollection.updateOne({ _id: ObjectID(booking.scheduleId) },
                                {
                                    $set: { seatsAvailable: booking.seatsAvailable }
                                }
                            )
                        })
                })





                res.send(result.insertedCount > 0)
            })
    })

    app.get('/bookings', (req, res) => {
        const queryEmail = req.query.email
        adminCollection.find({ email: queryEmail })
            .toArray((err, admins) => {
                const filter = {}
                if (admins.length === 0) {
                    filter.email = queryEmail
                }
                bookingCollection.find(filter)
                    .toArray((err, booking) => {
                        res.send(booking)
                    })
            })
    })
});

app.get('/', (req, res) => {
    res.send('Welcome to Busbd!')
})

app.listen(port)