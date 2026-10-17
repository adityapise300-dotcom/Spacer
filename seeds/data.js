// Sample data for `npm run seed`. Image URLs are intentionally blank:
// paste your own links into the `images` arrays (the seed script ignores empty strings).

const owners = [
  { name: 'Rohan Deshmukh', email: 'owner1@spacer.test', phone: '9822001001', password: 'Owner@123', businessName: 'Deshmukh Parking Ventures' },
  { name: 'Meera Kulkarni', email: 'owner2@spacer.test', phone: '9822001002', password: 'Owner@123', businessName: 'Kulkarni Realty Spaces' },
  { name: 'Sanjay Joshi', email: 'owner3@spacer.test', phone: '9822001003', password: 'Owner@123', businessName: 'Joshi Mobility Hub' },
];

const users = [
  { name: 'Aarav Patil', email: 'user1@spacer.test', phone: '9890002001', password: 'User@123', vehicles: [{ plateNumber: 'MH12AB1234', type: 'car' }, { plateNumber: 'MH12CD5678', type: 'bike' }] },
  { name: 'Isha Gokhale', email: 'user2@spacer.test', phone: '9890002002', password: 'User@123', vehicles: [{ plateNumber: 'MH14EF4321', type: 'suv' }] },
  { name: 'Kabir Shaikh', email: 'user3@spacer.test', phone: '9890002003', password: 'User@123', vehicles: [{ plateNumber: 'MH12GH1111', type: 'ev' }] },
  { name: 'Neha Bhosale', email: 'user4@spacer.test', phone: '9890002004', password: 'User@123', vehicles: [{ plateNumber: 'MH12JK2222', type: 'car' }] },
  { name: 'Vikram More', email: 'user5@spacer.test', phone: '9890002005', password: 'User@123', vehicles: [{ plateNumber: 'MH12LM3333', type: 'bike' }] },
];

// coordinates are [longitude, latitude]; slots = how many of each type to create
const zones = [
  {
    owner: 0, name: 'Koregaon Park Lane 7 Parking', category: 'market',
    description: 'Covered parking steps from the cafes and restaurants of Lane 7.',
    address: 'Lane 7, North Main Road, Koregaon Park', coordinates: [73.8937, 18.5362],
    vehicleTypesAllowed: ['bike', 'car', 'suv'], basePricePerHour: 50, openTime: '08:00', closeTime: '00:00',
    amenities: ['CCTV', 'Covered', 'Security'], images: ['https://images.unsplash.com/photo-1616363088386-31c4a8414858?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D'], slots: { car: 10, suv: 2, bike: 4 },
  },
  {
    owner: 0, name: 'FC Road Deccan Smart Lot', category: 'market',
    description: 'Student-friendly parking close to Fergusson College and the FC Road food street.',
    address: 'Fergusson College Road, Deccan Gymkhana', coordinates: [73.8412, 18.5236],
    vehicleTypesAllowed: ['bike', 'car'], basePricePerHour: 30, openTime: '07:00', closeTime: '23:00',
    amenities: ['CCTV', 'Security'], images: ['https://images.unsplash.com/photo-1636241166300-b801e6ddc0f4?q=80&w=1971&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D'], slots: { car: 8, bike: 10 },
  },
  {
    owner: 1, name: 'Hinjewadi Phase 1 Tech Park Parking', category: 'office',
    description: 'Reserved weekday parking for IT park commuters, with EV charging bays.',
    address: 'Rajiv Gandhi Infotech Park, Phase 1, Hinjewadi', coordinates: [73.7387, 18.5912],
    vehicleTypesAllowed: ['bike', 'car', 'suv', 'ev'], basePricePerHour: 40, openTime: '06:00', closeTime: '23:00',
    amenities: ['CCTV', 'Security', 'EV charging'], images: ['https://images.unsplash.com/photo-1526626607369-f89fe1ed77a9?q=80&w=1470&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D'], slots: { car: 12, suv: 2, bike: 4, ev: 2 },
  },
  {
    owner: 1, name: 'Viman Nagar Marketcity Annexe', category: 'mall',
    description: 'Covered annexe lot next to the mall, ideal for weekend shopping and movies.',
    address: 'Nagar Road, Viman Nagar', coordinates: [73.9144, 18.5679],
    vehicleTypesAllowed: ['bike', 'car', 'suv', 'ev'], basePricePerHour: 60, openTime: '09:00', closeTime: '00:00',
    amenities: ['CCTV', 'Covered', 'Security', 'EV charging'], images: ['https://images.unsplash.com/photo-1720166671019-744dcef65d05?q=80&w=1632&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D'], slots: { car: 12, suv: 3, ev: 3, bike: 2 },
  },
  {
    owner: 2, name: 'Kothrud Karve Road Parking Hub', category: 'residential',
    description: 'Visitor and resident overflow parking close to Karve Road.',
    address: 'Karve Road, Kothrud', coordinates: [73.8139, 18.5074],
    vehicleTypesAllowed: ['bike', 'car'], basePricePerHour: 25, openTime: '00:00', closeTime: '00:00',
    amenities: ['CCTV'], images: ['https://images.unsplash.com/photo-1562426509-5044a121aa49?q=80&w=1470&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D'], slots: { car: 6, bike: 6 },
  },
  {
    owner: 2, name: 'Baner High Street Parking', category: 'market',
    description: 'Evening hangout parking for Baner High Street restaurants and pubs.',
    address: 'Baner Road, Baner', coordinates: [73.7868, 18.559],
    vehicleTypesAllowed: ['bike', 'car', 'suv'], basePricePerHour: 45, openTime: '10:00', closeTime: '00:00',
    amenities: ['CCTV', 'Security'], images: ['https://images.unsplash.com/photo-1604063165585-e17e9c3c3f0b?q=80&w=1469&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D'], slots: { car: 9, suv: 2, bike: 4 },
  },
  {
    owner: 1, name: 'Pune Station Transit Parking', category: 'transit',
    description: 'Safe parking for commuters and travellers near Pune Junction railway station.',
    address: 'Station Road, near Pune Junction', coordinates: [73.8742, 18.5287],
    vehicleTypesAllowed: ['bike', 'car'], basePricePerHour: 35, openTime: '00:00', closeTime: '00:00',
    amenities: ['CCTV', 'Security'], images: ['https://images.unsplash.com/photo-1590674899484-d5640e854abe?q=80&w=1467&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D'], slots: { car: 10, bike: 8 },
  },
  {
    owner: 0, name: 'Magarpatta City Office Block Parking', category: 'office',
    description: 'Weekday parking inside the Magarpatta township office district.',
    address: 'Magarpatta City, Hadapsar', coordinates: [73.93, 18.5158],
    vehicleTypesAllowed: ['bike', 'car', 'suv', 'ev'], basePricePerHour: 40, openTime: '06:00', closeTime: '22:00',
    amenities: ['CCTV', 'Covered', 'Security', 'EV charging'], images: ['https://plus.unsplash.com/premium_photo-1673886205989-24c637783c60?q=80&w=1470&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D'], slots: { car: 10, suv: 2, ev: 2, bike: 4 },
  },
];

module.exports = { owners, users, zones };
