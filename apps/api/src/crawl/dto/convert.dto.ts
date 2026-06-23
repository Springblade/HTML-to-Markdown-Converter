import { IsString, IsNotEmpty, IsInt, Min, Max, Matches, IsOptional, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';

const CRAWL_MAX_PAGES_TOTAL = parseInt(process.env.CRAWL_MAX_PAGES_TOTAL ?? '10', 10);

export class ConvertDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^https?:\/\//, { message: 'URL must start with http:// or https://' })
  url: string;

  @IsInt()
  @Min(0)
  @Max(CRAWL_MAX_PAGES_TOTAL)
  maxPages: number;

  @IsOptional()
  @IsString()
  @Matches(/^.{1,500}$/, { message: 'cssSelector must be 1-500 characters' })
  cssSelector?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => (Array.isArray(value) ? value.slice(0, 50) : value))
  excludedTags?: string[];
}
