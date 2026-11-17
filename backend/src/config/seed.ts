import dotenv from "dotenv";
dotenv.config();

import prisma from "./db.js";

// ================= USERS SEED (KEPT AS-IS) =================
async function seedUsers(): Promise<void> {
  // for (const user of usersSeed) {
  //   const hashedPassword = await bcrypt.hash(user.password, 10);

  //   await prisma.user.create({
  //     data: {
  //       email: user.email,
  //       password: hashedPassword,
  //       profile: {
  //         create: {
  //           name: user.fullName,
  //         },
  //       },
  //     },
  //   });
  // }
}

// ================= CHAT SEED =================

const rahulId: string = "695429f9f11c6185c7225d05";

const otherUsers: string[] = [
  "695429f9f11c6185c7225d07", // Ankit
  "695429faf11c6185c7225d09", // Priya
  "695429faf11c6185c7225d0b", // Neha
  "695429faf11c6185c7225d0d", // Amit
  "695429faf11c6185c7225d0f", // Rohit
  "695429fbf11c6185c7225d11", // Pooja
  "695429fbf11c6185c7225d13", // Suresh
  "695429fbf11c6185c7225d15", // Kavya
];

const messagesPool: string[] = [
  "Hey Rahul!",
  "How's it going?",
  "Are you free today?",
  "Let's sync up",
  "Working on the feature now",
  "That sounds good 👍",
  "Haha 😂",
  "Sure, no problem",
  "I'll get back to you",
  "Thanks!",
  "Got it",
  "Talk later",
  "Ping me when done",
  "Cool 😎",
  "Makes sense"
];

async function createThreadIfNotExists(userA: string, userB: string): Promise<void> {
  const existing = await prisma.chatParticipant.findFirst({
    where: {
      userId: userA,
      thread: {
        participants: {
          some: { userId: userB }
        }
      }
    }
  });

  if (existing) {
    console.log(`⚠️ Thread already exists between ${userA} & ${userB}`);
    return;
  }

  const thread = await prisma.chatThread.create({
    data: {}
  });

  await prisma.chatParticipant.createMany({
    data: [
      { userId: userA, threadId: thread.id },
      { userId: userB, threadId: thread.id }
    ]
  });

  const messages: { content: string; senderId: string; threadId: string }[] = [];

  for (let i = 0; i < 65; i++) {
    messages.push({
      content: messagesPool[Math.floor(Math.random() * messagesPool.length)],
      senderId: i % 2 === 0 ? userA : userB,
      threadId: thread.id
    });
  }

  await prisma.message.createMany({ data: messages });

  console.log(`✅ Chat created: Rahul ↔ ${userB}`);
}

async function seedRahulChats(): Promise<void> {
  console.log("🌱 Seeding Rahul's chatrooms...");

  for (const userId of otherUsers) {
    await createThreadIfNotExists(rahulId, userId);
  }

  console.log("🎉 Rahul chat seeding completed");
}

// ================= MAIN RUNNER =================
async function main(): Promise<void> {
  try {
    // await seedUsers(); // keep commented until needed
    await seedRahulChats();
  } catch (error) {
    console.error("❌ Seeding failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
