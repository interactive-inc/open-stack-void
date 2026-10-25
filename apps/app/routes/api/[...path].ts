import { defineHandler } from "void"
import { api } from "@/api/api"

export const GET = defineHandler((context) => api.fetch(context.req.raw, context.env))
export const POST = defineHandler((context) => api.fetch(context.req.raw, context.env))
export const PATCH = defineHandler((context) => api.fetch(context.req.raw, context.env))
export const DELETE = defineHandler((context) => api.fetch(context.req.raw, context.env))
