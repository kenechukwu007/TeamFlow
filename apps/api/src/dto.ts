import { IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class LoginDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @Length(1, 200) password!: string;
}
export class ProjectDto {
  @Transform(trim) @IsString() @Length(1, 80) name!: string;
  @IsString() @MaxLength(500) description = '';
}
export class RegisterDto extends LoginDto {
  @Transform(trim) @IsString() @Length(2, 80) name!: string;
  @IsString() @Length(12, 200) declare password: string;
}
export class TicketDto {
  @IsUUID() projectId!: string;
  @Transform(trim) @IsString() @Length(1, 160) title!: string;
  @IsString() @MaxLength(4000) description = '';
  @IsIn(['low', 'medium', 'high']) priority = 'medium';
  @IsOptional() @IsUUID() assigneeId?: string;
}
export class StatusDto {
  @IsIn(['todo', 'in_progress', 'done']) status!: string;
}
export class EditTicketDto {
  @Transform(trim) @IsString() @Length(1, 160) title!: string;
  @IsString() @MaxLength(4000) description = '';
  @IsIn(['todo', 'in_progress', 'done']) status!: string;
  @IsIn(['low', 'medium', 'high']) priority!: string;
  @IsOptional() @IsUUID() assigneeId?: string | null;
}
export class CommentDto {
  @Transform(trim) @IsString() @Length(1, 2000) body!: string;
}
