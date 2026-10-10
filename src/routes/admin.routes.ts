import { Router } from "express";
import { createAdmin } from "../controllers/admin.controller";
import { getSummary } from "../controllers/dashboard.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { verificarPermissao } from "../middleware/rbac.middleware";

const adminRouter = Router();

adminRouter.post(
  "/cadastro",
  authMiddleware,
  verificarPermissao("ADMIN"),
  createAdmin,
);

adminRouter.get(
  "/dashboard/summary",
  authMiddleware,
  verificarPermissao("ADMIN"),
  getSummary
);

export default adminRouter;
