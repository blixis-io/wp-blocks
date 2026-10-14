<?php
/**
 * Tokenizer implementation.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Css;

/** Tokenizer contract. */
final class Tokenizer {
	public const FORBIDDEN = [ '\\', ';', '{', '}', '<', '>', '@', '!', '"', "'", '[', ']', '`', ':', '&', '|', '^', '~', '$', '?', '=', '_' ];

	/**
	 * Parse.
	 *
	 * @param string $value Value.
	 * @param bool   $strings Strings.
	 * @return array{ok: true, components: array<array<string, mixed>>}|array{ok: false, code: string, message: string}
	 */
	public static function parse( string $value, bool $strings = false ): array {
		$length = \strlen( $value );
		if ( $length > CssLimits::MAX_VALUE_LENGTH ) {
			if ( $length > CssLimits::MAX_VALUE_LENGTH * 4 ) {
				return self::fail( 'value-too-long', 'longer than 2048 characters' );
			}
			$units = self::utf16_length( $value );
			if ( null === $units ) {
				return self::fail( 'forbidden-character', 'only printable ASCII is allowed (no control, newline or non-ASCII characters)' );
			}
			if ( $units > CssLimits::MAX_VALUE_LENGTH ) {
				return self::fail( 'value-too-long', 'longer than 2048 characters' );
			}
		}
		for ( $p = 0; $p < $length; ++$p ) {
			$c   = $value[ $p ];
			$ord = \ord( $c );
			if ( $ord < 32 || $ord > 126 ) {
				return self::fail( 'forbidden-character', 'only printable ASCII is allowed (no control, newline or non-ASCII characters)' );
			}
			if ( \in_array( $c, self::FORBIDDEN, true ) && ! ( $strings && '"' === $c ) ) {
				return self::fail( 'forbidden-character', "the character \"{$c}\" is not allowed in a value" );
			}
		}
		if ( \str_contains( $value, '/*' ) || \str_contains( $value, '*/' ) ) {
			return self::fail( 'forbidden-character', 'comments are not allowed' );
		}
		/**
		 * Scanner frames.
		 *
		 * @var list<array{name: string, children: array<array<string, mixed>>}> $stack
		 */
		$stack = [
			[
				'name'     => '',
				'children' => [],
			],
		];
		$count = 0;
		$i     = 0;
		while ( $i < $length ) {
			$c     = $value[ $i ];
			$n     = $value[ $i + 1 ] ?? '';
			$token = null;
			if ( ' ' === $c ) {
				while ( ( $value[ $i ] ?? '' ) === ' ' ) {
					++$i; }
				$token = [ 't' => 'space' ];
			} elseif ( '(' === $c ) {
				if ( \count( $stack ) > CssLimits::MAX_DEPTH ) {
					return self::fail( 'too-complex', 'nesting deeper than 8 levels' ); }
				++$count;
				$stack[] = [
					'name'     => '',
					'children' => [],
				];
				++$i;
			} elseif ( ')' === $c ) {
				if ( 1 === \count( $stack ) ) {
					return self::fail( 'syntax', 'unbalanced ")"' ); }
				$frame = \array_pop( $stack );
				if ( null === $frame ) {
					return self::fail( 'syntax', 'unbalanced ")"' );
				}
				$token = [
					't'        => 'fn',
					'name'     => $frame['name'],
					'children' => self::tidy( $frame['children'] ),
				];
				++$i;
			} elseif ( ',' === $c || '/' === $c || '*' === $c ) {
				$token = '*' === $c ? [
					't' => 'op',
					'v' => '*',
				] : [ 't' => ',' === $c ? 'comma' : 'slash' ];
				++$i;
			} elseif ( '"' === $c ) {
				$end  = \strpos( $value, '"', $i + 1 );
				$name = false === $end ? '' : \substr( $value, $i + 1, $end - $i - 1 );
				if ( 1 !== \preg_match( '/^[A-Za-z0-9][A-Za-z0-9 -]{0,62}$/D', $name ) ) {
					return self::fail( 'syntax', 'invalid quoted name' ); }
				$token = [
					't' => 'string',
					'v' => $name,
				];
				$i     = $end + 1;
			} elseif ( '#' === $c ) {
				$j = $i + 1;
				while ( self::hex( $value[ $j ] ?? '' ) ) {
					++$j; }
				$size = $j - $i - 1;
				if ( ! \in_array( $size, [ 3, 4, 6, 8 ], true ) || self::ident_char( $value[ $j ] ?? '' ) ) {
					return self::fail( 'syntax', 'invalid hex colour' ); }
				$token = [
					't' => 'hash',
					'v' => \strtolower( \substr( $value, $i + 1, $size ) ),
				];
				$i     = $j;
			} elseif ( self::digit( $c ) || ( '.' === $c && self::digit( $n ) ) || ( ( '+' === $c || '-' === $c ) && ( self::digit( $n ) || ( '.' === $n && self::digit( $value[ $i + 2 ] ?? '' ) ) ) ) ) {
				$j     = $i + ( '+' === $c || '-' === $c ? 1 : 0 );
				$start = $j;
				while ( self::digit( $value[ $j ] ?? '' ) ) {
					++$j; }
				if ( ( $value[ $j ] ?? '' ) === '.' ) {
					++$j;
					if ( ! self::digit( $value[ $j ] ?? '' ) ) {
						return self::fail( 'syntax', 'invalid number' ); }
					while ( self::digit( $value[ $j ] ?? '' ) ) {
						++$j; }
				}
				if ( $j - $start - ( \str_contains( \substr( $value, $start, $j - $start ), '.' ) ? 1 : 0 ) > CssLimits::MAX_DIGITS ) {
					return self::fail( 'syntax', 'numbers may have at most 10 digits' ); }
				$text = \substr( $value, $i, $j - $i );
				if ( \str_starts_with( $text, '+' ) ) {
					$text = \substr( $text, 1 ); }
				if ( \str_starts_with( $text, '.' ) ) {
					$text = '0' . $text; }
				if ( \str_starts_with( $text, '-.' ) ) {
					$text = '-0' . \substr( $text, 1 ); }
				if ( ( $value[ $j ] ?? '' ) === '%' ) {
					$token = [
						't' => 'percent',
						'v' => $text,
					];
					++$j;
				} elseif ( self::alpha( $value[ $j ] ?? '' ) ) {
					$u = $j;
					while ( self::alpha( $value[ $j ] ?? '' ) ) {
						++$j; }
					if ( self::digit( $value[ $j ] ?? '' ) || ( $value[ $j ] ?? '' ) === '-' ) {
						return self::fail( 'syntax', 'invalid unit' ); }
					$token = [
						't'    => 'dimension',
						'v'    => $text,
						'unit' => \strtolower( \substr( $value, $u, $j - $u ) ),
					];
				} else {
					if ( self::ident_char( $value[ $j ] ?? '' ) ) {
						return self::fail( 'syntax', 'invalid number' ); }
					$token = [
						't' => 'number',
						'v' => $text,
					];
				}
				$i = $j;
			} elseif ( self::alpha( $c ) || ( '-' === $c && ( self::alpha( $n ) || '-' === $n ) ) ) {
				$j = $i;
				while ( self::ident_char( $value[ $j ] ?? '' ) ) {
					++$j; }
				$name = \strtolower( \substr( $value, $i, $j - $i ) );
				if ( ( $value[ $j ] ?? '' ) === '(' ) {
					if ( \count( $stack ) > CssLimits::MAX_DEPTH ) {
						return self::fail( 'too-complex', 'nesting deeper than 8 levels' ); }
					++$count;
					$stack[] = [
						'name'     => $name,
						'children' => [],
					];
					++$j;
				} else {
					$token = [
						't' => 'ident',
						'v' => $name,
					]; }
				$i = $j;
			} elseif ( ( '+' === $c || '-' === $c ) && ( ' ' === $n || ')' === $n || '' === $n ) ) {
				$token = [
					't' => 'op',
					'v' => $c,
				];
				++$i;
			} else {
				return self::fail( 'syntax', "unexpected \"{$c}\"" ); }
			if ( null !== $token ) {
				$top      = \count( $stack ) - 1;
				$children = &$stack[ $top ]['children'];
				$previous = [] === $children ? null : $children[ \count( $children ) - 1 ];
				if ( self::value_token( $token ) && null !== $previous && self::value_token( $previous ) ) {
					return self::fail( 'syntax', 'values must be separated by whitespace or an operator' ); }
				if ( 'fn' !== $token['t'] || ')' !== $c ) {
					++$count;
					if ( $count > CssLimits::MAX_COMPONENTS ) {
						return self::fail( 'too-complex', 'more than 256 components' ); }
				}
				$children[] = $token;
				unset( $children );
			}
		}
		if ( 1 !== \count( $stack ) ) {
			return self::fail( 'syntax', 'unbalanced "("' ); }
		return [
			'ok'         => true,
			'components' => self::tidy( $stack[0]['children'] ),
		];
	}

	/**
	 * Count UTF-16 code units for the TypeScript length bound; reject malformed UTF-8.
	 *
	 * @param string $value Candidate value.
	 * @return int|null Code units or null for malformed UTF-8.
	 */
	private static function utf16_length( string $value ): ?int {
		$length = \strlen( $value );
		$units  = 0;
		for ( $i = 0; $i < $length; ++$i ) {
			$lead = \ord( $value[ $i ] );
			if ( $lead < 128 ) {
				++$units;
				continue;
			}
			if ( $lead >= 194 && $lead <= 223 ) {
				$size = 1;
			} elseif ( $lead >= 224 && $lead <= 239 ) {
				$size = 2;
			} elseif ( $lead >= 240 && $lead <= 244 ) {
				$size = 3;
			} else {
				return null;
			}
			$next = \ord( $value[ $i + 1 ] ?? "\0" );
			if ( ( 224 === $lead && $next < 160 ) || ( 237 === $lead && $next > 159 ) || ( 240 === $lead && $next < 144 ) || ( 244 === $lead && $next > 143 ) ) {
				return null;
			}
			for ( $offset = 1; $offset <= $size; ++$offset ) {
				$byte = \ord( $value[ $i + $offset ] ?? "\0" );
				if ( $byte < 128 || $byte > 191 ) {
					return null;
				}
			}
			$units += 3 === $size ? 2 : 1;
			$i     += $size;
		}
		return $units;
	}

	/**
	 * Tidy.
	 *
	 * @param array<array<string, mixed>> $components List.
	 * @return array<array<string, mixed>>
	 */
	public static function tidy( array $components ): array {
		$out = [];
		foreach ( $components as $c ) {
			$prev = $out[ \count( $out ) - 1 ] ?? null;
			if ( 'space' === $c['t'] ) {
				if ( null === $prev || \in_array( $prev['t'], [ 'space', 'comma', 'slash' ], true ) || ( 'op' === $prev['t'] && '*' === $prev['v'] ) ) {
					continue; }
			} elseif ( null !== $prev && 'space' === $prev['t'] && ( \in_array( $c['t'], [ 'comma', 'slash' ], true ) || ( 'op' === $c['t'] && '*' === $c['v'] ) ) ) {
				\array_pop( $out ); }
			$out[] = $c;
		}
		if ( 'space' === ( $out[ \count( $out ) - 1 ]['t'] ?? '' ) ) {
			\array_pop( $out ); }
		return $out;
	}

	/**
	 * Serialize.
	 *
	 * @param array<array<string, mixed>> $components List.
	 * @return string
	 */
	public static function serialize( array $components ): string {
		$out = '';
		foreach ( $components as $c ) {
			$out .= match ( $c['t'] ) {
				'ident', 'number' => $c['v'], 'dimension' => $c['v'] . $c['unit'], 'percent' => $c['v'] . '%',
				'hash' => '#' . $c['v'], 'string' => '"' . $c['v'] . '"', 'fn' => $c['name'] . '(' . self::serialize( $c['children'] ) . ')',
				'comma' => ', ', 'slash' => ' / ', 'op' => '*' === $c['v'] ? ' * ' : $c['v'], 'space' => ' ',
				default => '',
			};
		}
		return $out;
	}

	/**
	 * Fail.
	 *
	 * @param string $code Code.
	 * @param string $message Message.
	 * @return array{ok: false, code: string, message: string}
	 */
	private static function fail( string $code, string $message ): array {
		return [
			'ok'      => false,
			'code'    => $code,
			'message' => $message,
		]; }
	/**
	 * Digit.
	 *
	 * @param string $c C.
	 */
	private static function digit( string $c ): bool {
		return 1 === \strlen( $c ) && $c >= '0' && $c <= '9'; }
	/**
	 * Alpha.
	 *
	 * @param string $c C.
	 */
	private static function alpha( string $c ): bool {
		return 1 === \strlen( $c ) && ( ( $c >= 'a' && $c <= 'z' ) || ( $c >= 'A' && $c <= 'Z' ) ); }
	/**
	 * Ident char.
	 *
	 * @param string $c C.
	 */
	private static function ident_char( string $c ): bool {
		return self::alpha( $c ) || self::digit( $c ) || '-' === $c; }
	/**
	 * Hex.
	 *
	 * @param string $c C.
	 */
	private static function hex( string $c ): bool {
		return self::digit( $c ) || ( 1 === \strlen( $c ) && ( ( $c >= 'a' && $c <= 'f' ) || ( $c >= 'A' && $c <= 'F' ) ) ); }
	/**
	 * Value token.
	 *
	 * @param array<string, mixed> $c C.
	 */
	private static function value_token( array $c ): bool {
		return \in_array( $c['t'], [ 'ident', 'number', 'dimension', 'percent', 'hash', 'string', 'fn' ], true ); }
}
