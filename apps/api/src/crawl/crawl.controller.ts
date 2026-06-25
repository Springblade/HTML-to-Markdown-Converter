import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  ServiceUnavailableException,
  InternalServerErrorException,
} from '@nestjs/common';
import { CrawlService } from './crawl.service';
import { ConvertDto } from './dto/convert.dto';
import { CrawlResult } from './types';

@Controller()
export class CrawlController {
  private readonly logger = new Logger(CrawlController.name);

  constructor(private readonly crawlService: CrawlService) {}

  @Post('api/convert')
  @HttpCode(HttpStatus.OK)
  async convert(@Body() dto: ConvertDto): Promise<CrawlResult> {
    this.logger.log(`Converting URL: ${dto.url} (maxPages=${dto.maxPages})`);

    try {
      const result = await this.crawlService.crawlAndConvert(
        dto.url,
        dto.maxPages,
        dto.cssSelector ? { cssSelector: dto.cssSelector, excludedTags: dto.excludedTags } : undefined,
      );
      this.logger.log(`Converted ${result.pageCount} page(s) from ${dto.url}`);
      return result;
    } catch (error) {
      const crawlError = error as { message?: string; name?: string };

      if (crawlError.message?.includes('crawl4ai unavailable')) {
        this.logger.error(`crawl4ai service unavailable: ${crawlError.message}`);
        throw new ServiceUnavailableException(crawlError.message);
      }

      this.logger.error(`Crawl failed for ${dto.url}: ${crawlError.message}`);
      throw new InternalServerErrorException(
        process.env.NODE_ENV === 'production'
          ? 'Crawl failed. Please try again.'
          : crawlError.message ?? 'Crawl failed'
      );
    }
  }
}
