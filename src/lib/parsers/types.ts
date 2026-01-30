import type { BrokerInfo, ParsedDividendData } from '../core/types';

export interface DividendParser {
  brokerInfo: BrokerInfo;
  canParse: (file: File) => boolean;
  parse: (file: File) => Promise<ParsedDividendData>;
}
