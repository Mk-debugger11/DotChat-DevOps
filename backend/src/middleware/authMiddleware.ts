import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

interface JwtPayload {
    userId: string;
}

export default function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    const { authorization } = req.headers
    if(!authorization){
        res.status(401).json({
            message: "Authorization token missing"
        })
        return
    }
    const token: string = authorization.split(" ")[1]
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY as string) as JwtPayload
        req.user = decoded
        next()
    } catch {
        res.status(401).json({
            message: "Invalid or expired token"
        })
    }
}
