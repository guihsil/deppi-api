import { Request, Response } from "express";
import { getDashboardSummary } from "../services/dashboard.service";

export async function getSummary(req: Request, res: Response) {
  try {
    let cargos: string[] | undefined;
    
    if (req.query.cargos) {
      const validCargos = ["ALUNO", "PROFESSOR", "ADMIN", "DEPPI"];
      let rawCargos: any[] = [];

      if (Array.isArray(req.query.cargos)) {
        rawCargos = req.query.cargos;
      } else {
        rawCargos = [req.query.cargos];
      }

      cargos = rawCargos
        .map(c => String(c).toUpperCase())
        .filter(c => validCargos.includes(c));
    }

    const summary = await getDashboardSummary(cargos);
    return res.status(200).json(summary);
  } catch (error) {
    console.error("Erro ao obter summary do dashboard:", error);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
}

