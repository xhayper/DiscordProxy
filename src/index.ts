import "dotenv/config";

///////////////////////////////////////////////////////////////////////////

import fastifyUnderpressure from "@fastify/under-pressure";
import fastifyRatelimit from "@fastify/rate-limit";
import fastifyBearer from "@fastify//bearer-auth";
import fastifyCompress from "@fastify/compress";
import fastifyProxy from "@fastify/http-proxy";
import fastifyHelmet from "@fastify/helmet";

import { robloxRanges } from "./robloxRanges";
import fs from "node:fs/promises";
import fastify from "fastify";
import path from "node:path";

const LOCAL_IP = ["localhost", "::1", "127.0.0.1", "::ffff:"];
const PROJECT_PATH = "https://github.com/xhayper/DiscordProxy";

(async () => {
  const config = JSON.parse(
    await fs.readFile(path.join(__dirname, "../", "config.json"), "utf-8")
  ) as {
    onlyRobloxServer: boolean;
    placeIds: string[];
    apiKeys: string[];
  };
  const pkg = JSON.parse(
    await fs.readFile(path.join(__dirname, "../", "package.json"), "utf-8")
  ) as {
    version: string;
  };

  if (config.placeIds.length > 0)
    console.log("Place ID list is not empty! Tracking enabled.");

  const apiKeys = new Set(config.apiKeys);

  const app = fastify();

  app.register(fastifyCompress);
  app.register(fastifyHelmet, { global: true });

  if (apiKeys.size > 0) {
    app.register(fastifyBearer, { keys: apiKeys });
  }

  app.register(fastifyUnderpressure, {
    maxEventLoopDelay: 1000,
    maxHeapUsedBytes: 100000000,
    maxRssBytes: 100000000,
    maxEventLoopUtilization: 0.98,
    retryAfter: 50,
    message: "Under pressure!",
  });

  app.register(fastifyRatelimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  app.register(fastifyProxy, {
    upstream: "https://discord.com",
    prefix: "/api",
    rewritePrefix: "/api",
    preHandler: (request, reply, done) => {
      if (!config.onlyRobloxServer) return done();

      const ip = request.ip;

      if (LOCAL_IP.includes(ip)) return done();

      if (config.placeIds.length > 0) {
        const headers = request.headers;
        const placeId = headers["roblox-id"];

        if (!placeId || !config.placeIds.includes(placeId as string)) {
          reply
            .code(403)
            .send({ error: "You are not allowed to use this proxy." });
          return done();
        }
      }

      if (!robloxRanges.check(ip)) {
        reply
          .code(403)
          .send({ error: "You are not allowed to use this proxy." });
        return done();
      }

      return done();
    },
    replyOptions: {
      rewriteRequestHeaders: (_, headers) => {
        headers["user-agent"] = `DiscordProxy/${pkg.version} (${PROJECT_PATH})`;
        delete headers["roblox-id"];
        return headers;
      },
    },
  });

  app.get("/", async (_, reply) => {
    reply.redirect(PROJECT_PATH);
  });

  app
    .listen({ host: "0.0.0.0", port: parseInt(process.env.PORT ?? "3000") })
    .then((host) => {
      console.log(`Listening on ${host}`);
    });
})();
