import type { FastifyInstance } from "fastify";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../../context/requestContextMiddleware.js";
import { assertCityScopedContext } from "../../dal/scopedExecutor.js";
import {
  workerCertificationService,
  CertificationValidationError,
  WorkerNotFoundError,
  WorkerCityBindingError,
} from "./workerCertificationService.js";
import {
  workerCertificationReviewService,
  InvalidCertificationTransitionError,
  CertificationReviewForbiddenError,
} from "./workerCertificationReviewService.js";
import { CertificationNotFoundError } from "./workerCertificationService.js";
import { workerDispatchEligibilityService } from "../certMatcher/workerDispatchEligibility.js";
import { workerEligibilityQuerySchema } from "@xlb/validators";
import {
  workerService,
  WorkerNotFoundError as EligibilityWorkerNotFoundError,
  WorkerCityBindingError as EligibilityWorkerCityBindingError,
} from "../../worker/workerService.js";

export async function registerWorkerCertificationModule(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    "/api/admin/certifications",
    { preHandler: createRequestContextMiddleware({ requireCityCode: true }) },
    async (request, reply) => {
      const context = getRequestContext(request);
      const status = (request.query as { status?: "pending" | "approved" | "rejected" | "expired" }).status;
      try {
        return { ok: true, certifications: await workerCertificationReviewService.list(context, status) };
      } catch (error) {
        if (error instanceof CertificationReviewForbiddenError) return reply.status(403).send({ ok: false, error: error.message });
        if (error instanceof Error && (error as { statusCode?: number }).statusCode === 403) return reply.status(403).send({ ok: false, error: error.message });
        throw error;
      }
    },
  );
  app.post(
    "/api/worker/certifications",
    { preHandler: createRequestContextMiddleware({ requireCityCode: true }) },
    async (request, reply) => {
      const context = getRequestContext(request);

      if (context.appType !== "worker" || context.role !== "worker") {
        return reply.status(403).send({
          ok: false,
          error: "Certification submit requires worker app with worker role",
        });
      }

      if (!context.userId) {
        return reply.status(403).send({
          ok: false,
          error: "Missing authenticated worker identity",
        });
      }

      try {
        const certification = await workerCertificationService.submitCertification(
          context,
          request.body,
        );
        return { ok: true, certification };
      } catch (error) {
        if (error instanceof CertificationValidationError) {
          return reply.status(400).send({ ok: false, error: error.message });
        }
        if (
          error instanceof WorkerNotFoundError ||
          error instanceof WorkerCityBindingError
        ) {
          return reply.status(403).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );

  app.get(
    "/api/worker/eligibility",
    { preHandler: createRequestContextMiddleware({ requireCityCode: true }) },
    async (request, reply) => {
      const context = getRequestContext(request);

      if (context.appType !== "worker" || context.role !== "worker") {
        return reply.status(403).send({
          ok: false,
          error: "Eligibility query requires worker app with worker role",
        });
      }

      if (!context.userId) {
        return reply.status(403).send({
          ok: false,
          error: "Missing authenticated worker identity",
        });
      }

      const parsed = workerEligibilityQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ ok: false, error: parsed.error.message });
      }

      const cityCode = assertCityScopedContext(context);

      try {
        await workerService.assertWorkerBoundToCity(context.userId, cityCode);

        const eligibility = await workerDispatchEligibilityService.computeEligibility(
          context.userId,
          cityCode,
          parsed.data.skuId,
        );
        return { ok: true, eligibility };
      } catch (error) {
        if (
          error instanceof EligibilityWorkerNotFoundError ||
          error instanceof EligibilityWorkerCityBindingError
        ) {
          return reply.status(403).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );

  app.post(
    "/api/admin/certifications/:certificationId/approve",
    { preHandler: createRequestContextMiddleware({ requireCityCode: true }) },
    async (request, reply) => {
      const context = getRequestContext(request);
      const { certificationId } = request.params as { certificationId: string };

      try {
        const certification = await workerCertificationReviewService.approve(
          context,
          certificationId,
        );
        return { ok: true, certification };
      } catch (error) {
        if (error instanceof CertificationReviewForbiddenError) {
          return reply.status(403).send({ ok: false, error: error.message });
        }
        if (error instanceof CertificationNotFoundError) {
          return reply.status(404).send({ ok: false, error: error.message });
        }
        if (error instanceof InvalidCertificationTransitionError) {
          return reply.status(409).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );

  app.post(
    "/api/admin/certifications/:certificationId/reject",
    { preHandler: createRequestContextMiddleware({ requireCityCode: true }) },
    async (request, reply) => {
      const context = getRequestContext(request);
      const { certificationId } = request.params as { certificationId: string };

      try {
        const certification = await workerCertificationReviewService.reject(
          context,
          certificationId,
          request.body,
        );
        return { ok: true, certification };
      } catch (error) {
        if (error instanceof CertificationReviewForbiddenError) {
          return reply.status(403).send({ ok: false, error: error.message });
        }
        if (error instanceof CertificationValidationError) {
          return reply.status(400).send({ ok: false, error: error.message });
        }
        if (error instanceof CertificationNotFoundError) {
          return reply.status(404).send({ ok: false, error: error.message });
        }
        if (error instanceof InvalidCertificationTransitionError) {
          return reply.status(409).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );
}

export const workerCertificationModule = registerWorkerCertificationModule;
