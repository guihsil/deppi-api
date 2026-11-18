import { AppError } from "../errors/AppError";
import { prisma } from "../lib/prisma";
import { storageService } from "../storage/storageDocuments";
import { resolverReferenciaCapa } from "../storage/referenciaArquivo";

interface Cover {
    cursoID: string;
    file?: Express.Multer.File;
}

export class UploadCoverService {
    async execute({ cursoID, file }: Cover) {
        if (!file) {
            throw new AppError("Capa obrigatória");
        }

        const curso = await prisma.curso.findFirst({
            where: {
                id: cursoID,
            },
        });

        if (!curso) {
            throw new AppError("Curso não encontrado");
        }

        const bucket = storageService.getBucketImagem();
        const { nomeArquivo, chave } = await storageService.salvar(
            file.buffer,
            file.originalname,
            "covers",
            bucket,
            file.mimetype,
        );

        try {
            await prisma.curso.update({
                where: { id: cursoID },
                data: {
                    Capa: {
                        create: {
                            nomeArquivo,
                            nomeOriginal: file.originalname,
                            mimeType: file.mimetype,
                            size: file.size,
                            path: storageService.getUrlPublica(chave, bucket),
                        },
                    },
                },
            });
        } catch (error) {
            try {
                await storageService.remover(chave, bucket);
            } catch {
                console.error("Falha na limpeza de upload de capa", { cursoID, nomeArquivo });
            }
            throw error;
        }
    }
}

export class ShowCoverService {
    async execute({ cursoID }: Cover) {
        const curso = await prisma.curso.findFirst({
            where: {
                id: cursoID
            },
            include: {
                Capa: true,
            },
        });

        if (!curso) {
            throw new AppError("Curso não encontrado");
        }

        if (!curso.Capa) {
            throw new AppError("Imagem não encontrada");
        }

        const { chave, bucket } = resolverReferenciaCapa(curso.Capa);
        const caminho = (await storageService.assinarURLs([chave], bucket)).get(chave);
        if (!caminho) throw new AppError("Arquivo da capa indisponível.", 404);
        return caminho;
    }
}
