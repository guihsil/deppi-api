import { Request, Response } from 'express';
import { CourseService, UsuarioLogado } from '../services/course.service';
import { createCourseSchema, updateCourse } from '../schemas/course.schema';
import { AppError } from '../errors/AppError';

const courseService = new CourseService();

function getUsuarioLogado(req: Request): UsuarioLogado {
  const user = req.user;
  if (!user?.userId) throw new AppError("Usuário não autenticado.", 401);
  return { userId: user.userId };
}

export class CourseController {
  async create(req: Request, res: Response) {
    try {
      const usuarioLogado = getUsuarioLogado(req);
      const parsed = createCourseSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Dados do curso inválidos.",
          details: parsed.error.issues,
        });
      }

      const curso = await courseService.createCourse(parsed.data, usuarioLogado);
      return res.status(201).json({ message: "Curso criado com sucesso. ", data: curso });
    } catch (error: any) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      const status = error.message.includes("Acesso negado") ? 403 : 400;
      return res.status(status).json({ error: error.message });
    }
  }

  async findAll(req: Request, res: Response) {
    try {
      const usuarioLogado = getUsuarioLogado(req);
      const cursos = await courseService.readCourses(usuarioLogado);
      return res.status(200).json({ data: cursos });
    } catch (error: any) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      return res.status(400).json({ error: error.message });
    }
  }

  async findOne(req: Request, res: Response) {
    try {
      const usuarioLogado = getUsuarioLogado(req);
      const id = req.params.id as string;
      
      const curso = await courseService.readCourseById(id, usuarioLogado);
      return res.status(200).json({ data: curso });
    } catch (error: any) {
      const status = error instanceof AppError
        ? error.statusCode
        : error.message.includes("Não encontrado.") ? 404 : 400;
      return res.status(status).json({ error: error.message });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const usuarioLogado = getUsuarioLogado(req);
      const id = req.params.id as string;
      const parsed = updateCourse.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Dados do curso inválidos.",
          details: parsed.error.issues,
        });
      }

      const curso = await courseService.updateCourse(id, parsed.data, usuarioLogado);
      return res.status(200).json({ message: "Curso atualizado com sucesso.", data: curso });
    } catch (error: any) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      const status = error.message.includes("Acesso negado.") ? 403
        : error.message.includes("Não encontrado.") ? 404 : 400;
      return res.status(status).json({ error: error.message });
    }
  }

  async remove(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      
      await courseService.deleteCourse(id);
      return res.status(200).json({ message: "Curso removido com sucesso." });
    } catch (error: any) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      const status = error.message.includes("Acesso negado. ") ? 403
        : error.message.includes("Não encontrado.") ? 404 : 400;
      return res.status(status).json({ error: error.message });
    }
  }
}