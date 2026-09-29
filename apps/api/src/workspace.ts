import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Database } from './database';
import { AuthGuard, AuthRequest } from './auth';
import { CommentDto, EditTicketDto, ProjectDto, StatusDto, TicketDto } from './dto';

@Controller()
@UseGuards(AuthGuard)
export class WorkspaceController {
  constructor(@Inject(Database) private db: Database) {}
  private async project(id: string) {
    const row = await this.db.get('SELECT * FROM projects WHERE id=$1', id);
    if (!row) throw new NotFoundException('Project not found.');
    return row;
  }
  private async ticket(id: string) {
    const row = await this.db.get('SELECT * FROM tickets WHERE id=$1', id);
    if (!row) throw new NotFoundException('Ticket not found.');
    return row;
  }
  private async assignee(id?: string | null) {
    if (id && !(await this.db.get('SELECT id FROM users WHERE id=$1', id)))
      throw new BadRequestException('Assignee not found.');
  }
  private async activity(userId: string, message: string) {
    await this.db.run(
      'INSERT INTO activity(id,actor_id,message) VALUES($1,$2,$3)',
      randomUUID(),
      userId,
      message,
    );
  }
  @Get('workspace')
  async workspace() {
    return {
      projects: await this.db.all('SELECT * FROM projects ORDER BY created_at DESC, id'),
      tickets: await this.db.all('SELECT * FROM tickets ORDER BY created_at DESC, id'),
      members: await this.db.all('SELECT id,name,email FROM users ORDER BY name'),
      activity: await this.db.all(
        'SELECT a.*,u.name AS actor_name FROM activity a JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC,a.sequence DESC LIMIT 30',
      ),
    };
  }
  @Post('projects')
  async createProject(@Body() body: ProjectDto, @Req() req: AuthRequest) {
    const id = randomUUID();
    await this.db.transaction(async () => {
      await this.db.run(
        'INSERT INTO projects(id,name,description) VALUES($1,$2,$3)',
        id,
        body.name,
        body.description,
      );
      await this.activity(req.user.id, `created project “${body.name}”`);
    });
    return await this.project(id);
  }
  @Patch('projects/:id')
  async editProject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ProjectDto,
    @Req() req: AuthRequest,
  ) {
    await this.project(id);
    await this.db.transaction(async () => {
      await this.db.run(
        'UPDATE projects SET name=$1,description=$2 WHERE id=$3',
        body.name,
        body.description,
        id,
      );
      await this.activity(req.user.id, `updated project “${body.name}”`);
    });
    return await this.project(id);
  }
  @Delete('projects/:id')
  @HttpCode(204)
  async deleteProject(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    const project = await this.project(id);
    await this.db.transaction(async () => {
      await this.db.run('DELETE FROM projects WHERE id=$1', id);
      await this.activity(req.user.id, `deleted project “${project.name}”`);
    });
  }
  @Post('tickets')
  async createTicket(@Body() body: TicketDto, @Req() req: AuthRequest) {
    await this.project(body.projectId);
    await this.assignee(body.assigneeId);
    const id = randomUUID();
    await this.db.transaction(async () => {
      await this.db.run(
        'INSERT INTO tickets(id,project_id,title,description,priority,assignee_id) VALUES($1,$2,$3,$4,$5,$6)',
        id,
        body.projectId,
        body.title,
        body.description,
        body.priority,
        body.assigneeId || null,
      );
      await this.activity(req.user.id, `created ticket “${body.title}”`);
    });
    return await this.ticket(id);
  }
  @Patch('tickets/:id')
  async editTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: EditTicketDto,
    @Req() req: AuthRequest,
  ) {
    await this.ticket(id);
    await this.assignee(body.assigneeId);
    await this.db.transaction(async () => {
      await this.db.run(
        'UPDATE tickets SET title=$1,description=$2,status=$3,priority=$4,assignee_id=$5,updated_at=$6 WHERE id=$7',
        body.title,
        body.description,
        body.status,
        body.priority,
        body.assigneeId || null,
        new Date().toISOString(),
        id,
      );
      await this.activity(req.user.id, `updated ticket “${body.title}”`);
    });
    return await this.ticket(id);
  }
  @Patch('tickets/:id/status')
  async status(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: StatusDto,
    @Req() req: AuthRequest,
  ) {
    const ticket = await this.ticket(id);
    await this.db.transaction(async () => {
      await this.db.run(
        'UPDATE tickets SET status=$1,updated_at=$2 WHERE id=$3',
        body.status,
        new Date().toISOString(),
        id,
      );
      await this.activity(
        req.user.id,
        `moved “${ticket.title}” to ${body.status.replace('_', ' ')}`,
      );
    });
    return await this.ticket(id);
  }
  @Delete('tickets/:id')
  @HttpCode(204)
  async deleteTicket(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    const ticket = await this.ticket(id);
    await this.db.transaction(async () => {
      await this.db.run('DELETE FROM tickets WHERE id=$1', id);
      await this.activity(req.user.id, `deleted ticket “${ticket.title}”`);
    });
  }
  @Get('tickets/:id/comments')
  async comments(@Param('id', ParseUUIDPipe) id: string) {
    await this.ticket(id);
    return await this.db.all(
      'SELECT c.*,u.name AS author_name FROM comments c JOIN users u ON u.id=c.user_id WHERE ticket_id=$1 ORDER BY created_at,c.sequence',
      id,
    );
  }
  @Post('tickets/:id/comments')
  async addComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CommentDto,
    @Req() req: AuthRequest,
  ) {
    const ticket = await this.ticket(id);
    await this.db.transaction(async () => {
      await this.db.run(
        'INSERT INTO comments(id,ticket_id,user_id,body) VALUES($1,$2,$3,$4)',
        randomUUID(),
        id,
        req.user.id,
        body.body,
      );
      await this.activity(req.user.id, `commented on “${ticket.title}”`);
    });
    return this.comments(id);
  }
}
