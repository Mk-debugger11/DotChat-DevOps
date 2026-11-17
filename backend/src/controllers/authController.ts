import { Request, Response } from 'express'
import bcrypt from "bcrypt"
import prisma from "../config/db.js"
import jwt from 'jsonwebtoken'
import { OAuth2Client } from 'google-auth-library'

const saltRound: number = 10

export async function register(req: Request, res: Response): Promise<void> {
  try {
    let { name, email, password, username } = req.body as { name?: string; email?: string; password?: string; username?: string }

    if (!name || !email || !password || !username) {
      res.status(400).json({
        message: "All fields are required.",
      })
      return
    }
    // regex means regular expressions it is used for password validation
    const passwordRegex: RegExp = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).+$/
    const emailRegex: RegExp = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      res.status(400).json({
        message: "Enter Valid email",
      })
      return
    }
    password = password.trim()
    
    if (password.length < 8) {
      res.status(400).json({
        message: "Password should be atleast 8 characters long",
      })
      return
    }
    if (!passwordRegex.test(password)) {
      res.status(400).json({
        message:
          "Password should contain Capital Letter[A-Z],Small letter[a-z],Digit[0-9]",
      })
      return
    }

    username = username.trim().toLowerCase()
    const usernameRegex: RegExp = /^[a-zA-Z0-9_]{3,20}$/
    if (!usernameRegex.test(username)) {
      res.status(400).json({
        message: "Username must be 3-20 characters and contain only letters, numbers, or underscores.",
      })
      return
    }

    const existEmail = await prisma.user.findUnique({ where: { email } })
    if (existEmail) {
      res.status(400).json({
        message: "An account with this email already exists.",
      })
      return
    }

    const existUsername = await prisma.userProfile.findUnique({ where: { username } })
    if (existUsername) {
      res.status(400).json({
        message: "Username is already taken. Please choose another username.",
      })
      return
    }

    const hashedPassword: string = await bcrypt.hash(password, saltRound)

    // making the first letter of name capital
    name = name.charAt(0).toUpperCase() + name.slice(1)

    const data = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        profile: {
          create: {
            name,
            username
          }
        }
      },
      include: {
        profile: true
      }
    })
    res.status(201).json({
      message: "User registered",
      data: {
        id: data.id,
        email: data.email,
        profile: data.profile
      },
    })
  } catch (error: any) {
    console.error("Register error:", error)
    if (error?.code === 'P2002') {
      const target = String(error?.meta?.target || '')
      if (target.includes('username')) {
        res.status(400).json({ message: "Username is already taken. Please choose another username." })
        return
      }
      if (target.includes('email')) {
        res.status(400).json({ message: "An account with this email already exists." })
        return
      }
      res.status(400).json({ message: "Username or email is already in use." })
      return
    }
    res.status(500).json({ message: "Something went wrong" })
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body as { email?: string; password?: string }
    if (!email || !password) {
      res.status(400).json({
        message: "All fields are required.",
      })
      return
    }
    const data = await prisma.user.findUnique({
      where: { email },
    })
    if (!data) {
      res.status(401).json({
        message: "Invalid email or password",
      })
      return
    }
    if (!data.password) {
      res.status(401).json({
        message: "This account is linked with Google. Please continue with Google.",
      })
      return
    }
    const passwordValidate: boolean = await bcrypt.compare(password, data.password)
    if (passwordValidate) {
      const token: string = jwt.sign(
        { userId: data.id },
        process.env.JWT_SECRET_KEY as string,
        { expiresIn: '2h' }
      )
      res.status(200).json({
        message: "Login successfull",
        token: token
      })
    } else {
      res.status(401).json({
        "message": "Invalid email or password"
      })
    }
  } catch (error) {
    res.status(500).json({
      "message": "Something went wrong",
      "error": error
    })
  }
}

export async function googleLogin(req: Request, res: Response): Promise<void> {
  try {
    const { credential, accessToken } = req.body as {
      credential?: string
      accessToken?: string
    }

    if (!credential && !accessToken) {
      res.status(400).json({ message: "Google credential or accessToken is required" })
      return
    }

    const clientId = process.env.GOOGLE_CLIENT_ID
    let payload: any

    if (credential) {
      const googleClient = new OAuth2Client(clientId)
      try {
        const ticket = await googleClient.verifyIdToken({
          idToken: credential,
          audience: clientId || undefined,
        })
        payload = ticket.getPayload()
      } catch (verifyErr) {
        console.error("Google token verification failed:", verifyErr)
        res.status(401).json({ message: "Invalid or expired Google token" })
        return
      }
    } else if (accessToken) {
      try {
        const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
        if (!userinfoRes.ok) {
          throw new Error(`Google API responded with status ${userinfoRes.status}`)
        }
        payload = await userinfoRes.json()
      } catch (err) {
        console.error("Google userinfo fetch failed:", err)
        res.status(401).json({ message: "Invalid or expired Google access token" })
        return
      }
    }

    if (!payload || !payload.email) {
      res.status(400).json({ message: "Could not extract user details from Google profile" })
      return
    }

    const email: string = payload.email
    const googleId: string = payload.sub
    const name: string = payload.name || payload.given_name || 'User'
    const picture: string | undefined = payload.picture

    // 1. Check if user already exists
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { googleId },
          { email }
        ]
      },
      include: {
        profile: true
      }
    })

    if (user) {
      // Link googleId if not present
      if (!user.googleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleId },
          include: { profile: true }
        })
      }
      // Update avatar if profile has none
      if (picture && user.profile && !user.profile.avatarUrl) {
        await prisma.userProfile.update({
          where: { id: user.profile.id },
          data: { avatarUrl: picture }
        })
      }
    } else {
      // 2. Generate a unique username from email
      const baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').toLowerCase().slice(0, 15) || 'user'
      let uniqueUsername = baseUsername
      let counter = 1

      while (await prisma.userProfile.findUnique({ where: { username: uniqueUsername } })) {
        uniqueUsername = `${baseUsername}${counter}`
        counter++
      }

      const formattedName = name.charAt(0).toUpperCase() + name.slice(1)

      user = await prisma.user.create({
        data: {
          email,
          googleId,
          profile: {
            create: {
              name: formattedName,
              username: uniqueUsername,
              avatarUrl: picture || null
            }
          }
        },
        include: {
          profile: true
        }
      })
    }

    // 3. Generate DotChat application JWT
    const token: string = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET_KEY as string,
      { expiresIn: '7d' }
    )

    res.status(200).json({
      message: "Google login successful",
      token,
      user: {
        id: user.id,
        email: user.email,
        profile: user.profile
      }
    })
  } catch (error) {
    console.error("googleLogin error:", error)
    res.status(500).json({ message: "Something went wrong during Google login" })
  }
}
