import { Body, Controller, Post } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/exceptions/error-response.dto';
import { ShippingQuoteDto, ShippingQuoteRequestDto } from './shipping-quote.dto';
import { ShippingQuoteService } from './shipping-quote.service';

@ApiTags('Storefront Shipping')
@Controller('shipping')
export class ShippingQuoteController {
  constructor(private readonly shipping: ShippingQuoteService) {}

  @Post('quotes')
  @ApiOperation({ operationId: 'quoteShipping', summary: 'Preview V1 delivery fee and ETA; checkout revalidates inputs' })
  @ApiOkResponse({ type: ShippingQuoteDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  quote(@Body() input: ShippingQuoteRequestDto): Promise<ShippingQuoteDto> {
    return this.shipping.quote(input);
  }
}
