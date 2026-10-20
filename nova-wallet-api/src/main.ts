import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ValidationError } from "class-validator";
import express, { NextFunction, Request, Response } from "express";
import { AppModule } from "./app.module";
import { ApiException } from "./common/exceptions/api.exception";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

async function bootstrap() {
  // bodyParser disabled on create so we can insert our own JSON-parse-error
  // handler right after express.json(), ahead of Nest's routing.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  app.use(express.json());
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError && "body" in err) {
      res.status(400).json({ error: "Malformed JSON body" });
      return;
    }
    next(err);
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      exceptionFactory: (errors: ValidationError[]) => {
        const first = errors[0];
        const message = first?.constraints
          ? Object.values(first.constraints)[0]
          : "Validation failed";
        return new ApiException(400, message as string);
      },
    })
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  console.log(`NovaWallet Transfer API listening on port ${port}`);
}

bootstrap();
