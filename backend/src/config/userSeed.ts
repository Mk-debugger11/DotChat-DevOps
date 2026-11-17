interface SeedUser {
  email: string;
  password: string;
  fullName: string;
}

export const usersSeed: SeedUser[] = [
  { email: "rahul.sharma@gmail.com", password: "password123", fullName: "Rahul Sharma" },
  { email: "ankit.verma@gmail.com", password: "password123", fullName: "Ankit Verma" },
  { email: "priya.singh@gmail.com", password: "password123", fullName: "Priya Singh" },
  { email: "neha.patel@gmail.com", password: "password123", fullName: "Neha Patel" },
  { email: "amit.kumar@gmail.com", password: "password123", fullName: "Amit Kumar" },
  { email: "rohit.mehta@gmail.com", password: "password123", fullName: "Rohit Mehta" },
  { email: "pooja.agarwal@gmail.com", password: "password123", fullName: "Pooja Agarwal" },
  { email: "suresh.nair@gmail.com", password: "password123", fullName: "Suresh Nair" },
  { email: "kavya.iyer@gmail.com", password: "password123", fullName: "Kavya Iyer" },
  { email: "arjun.reddy@gmail.com", password: "password123", fullName: "Arjun Reddy" },
  { email: "deepak.joshi@gmail.com", password: "password123", fullName: "Deepak Joshi" },
  { email: "manish.gupta@gmail.com", password: "password123", fullName: "Manish Gupta" },
  { email: "shreya.mishra@gmail.com", password: "password123", fullName: "Shreya Mishra" },
  { email: "vikram.malhotra@gmail.com", password: "password123", fullName: "Vikram Malhotra" },
  { email: "nisha.bansal@gmail.com", password: "password123", fullName: "Nisha Bansal" }
];
// Rahul  ↔ Ankit
// Priya  ↔ Neha
// Amit   ↔ Rohit
// Pooja  ↔ Suresh
// Kavya  ↔ Arjun
// Deepak ↔ Manish
// Shreya ↔ Vikram
