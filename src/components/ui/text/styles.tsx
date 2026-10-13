import { tva , isWeb } from '@gluestack-ui/utils/nativewind-utils';

const baseStyle = isWeb
  ? 'font-sans tracking-sm my-0 bg-transparent border-0 box-border display-inline list-none margin-0 padding-0 position-relative text-start no-underline whitespace-pre-wrap word-wrap-break-word'
  : '';

export const textStyle = tva({
  base: `text-foreground font-body ${baseStyle}`,

  variants: {
    isTruncated: {
      true: 'web:truncate',
    },
    bold: {
      true: 'font-bold',
    },
    underline: {
      true: 'underline',
    },
    strikeThrough: {
      true: 'line-through',
    },
    // from 3xl up: Tailwind's tight line heights clip the top of Eczar on iOS (it needs ~1.25em)
    size: {
      '2xs': 'text-2xs',
      'xs': 'text-xs',
      'sm': 'text-sm',
      'md': 'text-base',
      'lg': 'text-lg',
      'xl': 'text-xl',
      '2xl': 'text-2xl',
      '3xl': 'text-3xl leading-[38px]',
      '4xl': 'text-4xl leading-[46px]',
      '5xl': 'text-5xl leading-[62px]',
      '6xl': 'text-6xl leading-[76px]',
    },
    sub: {
      true: 'text-xs',
    },
    italic: {
      true: 'italic',
    },
    highlight: {
      true: 'bg-yellow-500',
    },
  },
});
