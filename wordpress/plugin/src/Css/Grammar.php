<?php
/**
 * Grammar implementation.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Css;

/** Grammar contract. */
final class Grammar {
	/**
	 * Group.
	 *
	 * @param string $group Group.
	 * @param string $name Name.
	 * @return list<string>
	 */
	private static function group( string $group, string $name ): array {
		return Properties::names( $group, $name ); }
	/**
	 * Has.
	 *
	 * @param array<string> $values Values.
	 * @param string        $value Value.
	 */
	private static function has( array $values, string $value ): bool {
		return \in_array( $value, $values, true ); }
	/**
	 * N.
	 *
	 * @param array<string, mixed> $c C.
	 */
	private static function n( array $c ): float {
		return isset( $c['v'] ) ? (float) $c['v'] : \NAN; }
	/**
	 * Ident.
	 *
	 * @param array<string, mixed> $c C.
	 * @param array<string>        $values Values.
	 */
	private static function ident( array $c, array $values ): bool {
		return 'ident' === $c['t'] && self::has( $values, $c['v'] ); }
	/**
	 * Math.
	 *
	 * @param array<string, mixed> $c C.
	 */
	private static function math( array $c ): bool {
		return 'fn' === $c['t'] && self::has( self::group( 'functions', 'math' ), $c['name'] ); }
	/**
	 * Len.
	 *
	 * @param array<string, mixed> $c C.
	 * @param bool                 $neg Neg.
	 */
	private static function len( array $c, bool $neg ): bool {
		return self::math( $c ) || ( 'number' === $c['t'] && 0.0 === self::n( $c ) ) || ( 'dimension' === $c['t'] && self::has( self::group( 'units', 'length' ), $c['unit'] ) && ( $neg || self::n( $c ) >= 0 ) ); }
	/**
	 * Lenpct.
	 *
	 * @param array<string, mixed> $c C.
	 * @param bool                 $neg Neg.
	 */
	private static function lenpct( array $c, bool $neg ): bool {
		return self::len( $c, $neg ) || ( 'percent' === $c['t'] && ( $neg || self::n( $c ) >= 0 ) ); }
	/**
	 * Color.
	 *
	 * @param array<string, mixed> $c C.
	 */
	private static function color( array $c ): bool {
		return ( 'ident' === $c['t'] && self::has( Properties::colors(), $c['v'] ) ) || 'hash' === $c['t'] || ( 'fn' === $c['t'] && self::has( self::group( 'functions', 'color' ), $c['name'] ) ); }
	/**
	 * Integer.
	 *
	 * @param array<string, mixed> $c C.
	 */
	private static function integer( array $c ): bool {
		return 'number' === $c['t'] && \floor( self::n( $c ) ) === self::n( $c ); }
	/**
	 * Split.
	 *
	 * @param array<array<string, mixed>> $components List.
	 * @return array<array<array<string, mixed>>>
	 */
	private static function split( array $components ): array {
		$out = [ [] ];
		foreach ( $components as $c ) {
			if ( 'comma' === $c['t'] ) {
				$out[] = [];
			} else {
				$out[ \count( $out ) - 1 ][] = $c;
			}
		} return $out; }
	/**
	 * Terms.
	 *
	 * @param array<array<string, mixed>> $components List.
	 * @return array<array<string, mixed>>
	 */
	private static function terms( array $components ): array {
		return \array_values( \array_filter( $components, static fn( array $c ): bool => 'space' !== $c['t'] ) ); }
	/**
	 * Bad.
	 *
	 * @param string $code Code.
	 * @param string $message Message.
	 * @return array{code: string, message: string}
	 */
	private static function bad( string $code, string $message ): array {
		return [
			'code'    => $code,
			'message' => $message,
		]; }
	/**
	 * Check var.
	 *
	 * @param array<string, mixed> $call Fn.
	 * @return array{code: string, message: string}|null
	 */
	private static function check_var( array $call ): ?array {
		$name = $call['children'][0] ?? null;
		if ( null === $name || 'ident' !== $name['t'] || 1 !== \preg_match( '/^--blx-[a-z0-9-]{1,64}$/D', $name['v'] ) ) {
			return self::bad( 'invalid-var', 'var() may only reference --blx-* custom properties' ); }
		$rest = \array_slice( $call['children'], 1 );
		if ( [] === $rest ) {
			return null; }
		if ( 'comma' !== $rest[0]['t'] || \count( $rest ) < 2 ) {
			return self::bad( 'invalid-var', 'invalid var() fallback' ); }
		return self::check_list( \array_slice( $rest, 1 ), 'custom' );
	}
	/**
	 * Expression.
	 *
	 * @param array<array<string, mixed>> $components List.
	 * @return array{code: string, message: string}|null
	 */
	private static function expression( array $components ): ?array {
		$i               = 0;
		$expect          = true;
		$divide          = false;
		$component_count = \count( $components );
		while ( $i < $component_count ) {
			$c = $components[ $i ];
			if ( $expect ) {
				if ( 'fn' === $c['t'] ) {
					if ( 'var' !== $c['name'] && '' !== $c['name'] && ! self::has( self::group( 'functions', 'math' ), $c['name'] ) ) {
						return self::bad( 'forbidden-function', $c['name'] . '() is not allowed in a calculation' ); }
					$failure = 'var' === $c['name'] ? self::check_var( $c ) : self::check_math( $c );
					if ( null !== $failure ) {
						return $failure; }
				} elseif ( 'dimension' === $c['t'] ) {
					if ( ! self::has( \array_merge( self::group( 'units', 'length' ), self::group( 'units', 'angle' ), self::group( 'units', 'time' ) ), $c['unit'] ) ) {
						return self::bad( 'forbidden-unit', 'the unit "' . $c['unit'] . '" is not allowed' ); }
				} elseif ( ! self::has( [ 'number', 'percent' ], $c['t'] ) ) {
					return self::bad( 'invalid-value', 'invalid math expression' ); }
				if ( $divide && 'number' === $c['t'] && 0.0 === self::n( $c ) ) {
					return self::bad( 'invalid-value', 'division by zero' ); }
				$divide = false;
				$expect = false;
				++$i;
			} elseif ( 'op' === $c['t'] && '*' === $c['v'] ) {
				$expect = true;
				++$i;
			} elseif ( 'slash' === $c['t'] ) {
				$expect = true;
				$divide = true;
				++$i;
			} elseif ( 'space' === $c['t'] && ( $components[ $i + 1 ]['t'] ?? '' ) === 'op' && ( $components[ $i + 2 ]['t'] ?? '' ) === 'space' && '*' !== $components[ $i + 1 ]['v'] ) {
				$expect = true;
				$i     += 3;
			} else {
				return self::bad( 'invalid-value', 'invalid math expression' ); }
		}
		return $expect ? self::bad( 'invalid-value', 'invalid math expression' ) : null;
	}
	/**
	 * Check math.
	 *
	 * @param array<string, mixed> $call Fn.
	 * @return array{code: string, message: string}|null
	 */
	private static function check_math( array $call ): ?array {
		$args = self::split( $call['children'] );
		$name = $call['name'];
		$lo   = 'clamp' === $name ? 3 : 1;
		$hi   = 'clamp' === $name ? 3 : ( self::has( [ 'min', 'max' ], $name ) ? 8 : 1 );
		if ( \count( $args ) < $lo || \count( $args ) > $hi ) {
			return self::bad( 'invalid-value', ( '' === $name ? 'parentheses' : $name ) . '() has the wrong number of arguments' ); }
		foreach ( $args as $arg ) {
			$failure = self::expression( $arg );
			if ( null !== $failure ) {
				return $failure; }
		}
		return null;
	}
	/**
	 * Check function.
	 *
	 * @param array<string, mixed> $call Fn.
	 * @param array<string>        $allowed Allowed.
	 * @return array{code: string, message: string}|null
	 */
	private static function check_function( array $call, array $allowed ): ?array {
		$name = $call['name'];
		if ( ! self::has( $allowed, $name ) ) {
			return self::bad( 'forbidden-function', ( '' === $name ? 'parentheses' : $name . '()' ) . ' is not allowed here' ); }
		if ( 'var' === $name ) {
			return self::check_var( $call ); }
		if ( self::has( self::group( 'functions', 'math' ), $name ) ) {
			return self::check_math( $call ); }
		if ( self::has( self::group( 'functions', 'color' ), $name ) ) {
			$failure = self::check_list( $call['children'], 'color' );
			if ( null !== $failure ) {
				return $failure; }
			$values = \count( \array_filter( $call['children'], static fn( array $c ): bool => ! \in_array( $c['t'], [ 'comma', 'slash', 'space' ], true ) ) );
			return $values >= 3 && ( 'color-mix' === $name || $values <= 4 ) ? null : self::bad( 'invalid-value', $name . '() has the wrong number of components' );
		}
		if ( self::has( self::group( 'functions', 'gradient' ), $name ) ) {
			return self::check_list( $call['children'], 'gradient' ); }
		if ( self::has( self::group( 'functions', 'track' ), $name ) ) {
			return self::check_list( $call['children'], 'tracks' ); }
		if ( self::has( self::group( 'functions', 'transform' ), $name ) ) {
			return self::check_list( $call['children'], 'transform' ); }
		if ( self::has( self::group( 'functions', 'easing' ), $name ) ) {
			$failure = self::check_list( $call['children'], 'easing' );
			if ( null !== $failure ) {
				return $failure; }
			$args = self::split( $call['children'] );
			if ( 'cubic-bezier' === $name ) {
				if ( 4 === \count( $args ) ) {
					$valid = true;
					foreach ( $args as $i => $arg ) {
						if ( 1 !== \count( $arg ) || 'number' !== $arg[0]['t'] || ( 0 === $i % 2 && ( self::n( $arg[0] ) < 0 || self::n( $arg[0] ) > 1 ) ) ) {
							$valid = false;
						}
					} if ( $valid ) {
						return null; }
				}
				return self::bad( 'invalid-value', 'cubic-bezier() needs four numbers, the x values between 0 and 1' );
			}
			$first = $args[0] ?? [];
			$ok    = ( 1 === \count( $args ) || 2 === \count( $args ) ) && 1 === \count( $first ) && self::integer( $first[0] ) && self::n( $first[0] ) >= 1 && self::n( $first[0] ) <= 100 && ( 1 === \count( $args ) || 1 === \count( $args[1] ) );
			return $ok ? null : self::bad( 'invalid-value', 'steps() needs a count from 1 to 100 and an optional position' );
		}
		return self::bad( 'forbidden-function', $name . '() is not allowed' );
	}
	/**
	 * Check list.
	 *
	 * @param array<array<string, mixed>> $components List.
	 * @param string                      $policy Policy.
	 * @return array{code: string, message: string}|null
	 */
	private static function check_list( array $components, string $policy ): ?array {
		$math  = self::group( 'functions', 'math' );
		$color = self::group( 'functions', 'color' );
		$units = match ( $policy ) {
			'color' => self::group( 'units', 'angle' ), 'gradient', 'transform' => \array_merge( self::group( 'units', 'length' ), self::group( 'units', 'angle' ) ), 'tracks' => \array_merge( self::group( 'units', 'length' ), [ 'fr' ] ), 'custom' => \array_merge( self::group( 'units', 'length' ), self::group( 'units', 'angle' ), self::group( 'units', 'time' ), [ 'fr' ] ), default => [] };
		$fns = match ( $policy ) {
			'color' => \array_merge( $math, $color, [ 'var' ] ), 'gradient' => \array_merge( $math, $color, [ 'var' ] ), 'tracks' => \array_merge( $math, self::group( 'functions', 'track' ), [ 'var' ] ), 'transform' => \array_merge( $math, [ 'var' ] ), 'custom' => \array_merge( $math, $color, self::group( 'functions', 'gradient' ), self::group( 'functions', 'track' ), self::group( 'functions', 'transform' ), self::group( 'functions', 'easing' ), [ 'var' ] ), default => [] };
		$idents = match ( $policy ) {
			'color' => \array_merge( self::group( 'identifiers', 'color' ), Properties::colors() ), 'gradient' => \array_merge( self::group( 'identifiers', 'gradient' ), Properties::colors() ), 'tracks' => self::group( 'identifiers', 'track' ), 'easing' => [ 'jump-start', 'jump-end', 'jump-none', 'jump-both', 'start', 'end' ], default => [] };
		foreach ( $components as $c ) {
			switch ( $c['t'] ) {
				case 'space':
					break;
				case 'comma':
					break;
				case 'slash':
					if ( ! self::has( [ 'color', 'gradient', 'custom' ], $policy ) ) {
						return self::bad( 'syntax', 'unexpected "/"' );
					} break;
				case 'op':
					return self::bad( 'syntax', 'unexpected "' . $c['v'] . '"' );
				case 'ident':
					if ( \str_starts_with( $c['v'], '--' ) ) {
						return self::bad( 'invalid-value', 'custom properties can only be used through var()' );
					} if ( 'custom' !== $policy && ! self::has( $idents, $c['v'] ) ) {
						return self::bad( 'invalid-value', '"' . $c['v'] . '" is not allowed here' );
					} break;
				case 'number':
					break;
				case 'percent':
					if ( 'easing' === $policy ) {
						return self::bad( 'invalid-value', 'a percentage is not allowed here' );
					} break;
				case 'string':
					if ( 'custom' !== $policy ) {
						return self::bad( 'syntax', 'strings are not allowed here' );
					} break;
				case 'hash':
					if ( ! self::has( [ 'color', 'gradient', 'custom' ], $policy ) ) {
						return self::bad( 'invalid-value', 'a colour is not allowed here' );
					} break;
				case 'dimension':
					if ( ! self::has( $units, $c['unit'] ) ) {
						return self::bad( 'forbidden-unit', 'the unit "' . $c['unit'] . '" is not allowed here' );
					} break;
				case 'fn':
					$failure = self::check_function( $c, $fns );
					if ( null !== $failure ) {
						return $failure;
					} break;
			}
		}
		return null;
	}
	/**
	 * Check functions.
	 *
	 * @param array<array<string, mixed>> $components List.
	 * @return array{code: string, message: string}|null
	 */
	public static function check_functions( array $components ): ?array {
		$fns = \array_merge( self::group( 'functions', 'math' ), self::group( 'functions', 'color' ), self::group( 'functions', 'gradient' ), self::group( 'functions', 'track' ), self::group( 'functions', 'transform' ), self::group( 'functions', 'easing' ), [ 'var' ] );
		foreach ( $components as $c ) {
			if ( 'fn' === $c['t'] ) {
				$failure = self::check_function( $c, $fns );
				if ( null !== $failure ) {
					return $failure; }
			} elseif ( 'dimension' === $c['t'] && ! self::has( \array_merge( self::group( 'units', 'length' ), self::group( 'units', 'angle' ), self::group( 'units', 'time' ), [ 'fr' ] ), $c['unit'] ) ) {
				return self::bad( 'forbidden-unit', 'the unit "' . $c['unit'] . '" is not allowed' ); } elseif ( 'op' === $c['t'] ) {
				return self::bad( 'syntax', 'unexpected "' . $c['v'] . '"' ); }
		}
		return null;
	}
	/**
	 * Check custom.
	 *
	 * @param array<array<string, mixed>> $components List.
	 * @return array{code: string, message: string}|null
	 */
	public static function check_custom( array $components ): ?array {
		return self::check_list( $components, 'custom' ); }
	/**
	 * Shadow.
	 *
	 * @param array<array<string, mixed>> $components List.
	 */
	private static function shadow( array $components ): bool {
		$groups = self::split( self::terms( $components ) );
		if ( \count( $groups ) > 6 ) {
			return false; }
		foreach ( $groups as $item ) {
			$inset   = 0;
			$colors  = 0;
			$lengths = [];
			foreach ( $item as $index => $c ) {
				if ( self::ident( $c, [ 'inset' ] ) ) {
					++$inset;
				} elseif ( self::color( $c ) ) {
					++$colors;
				} elseif ( self::len( $c, true ) ) {
					$lengths[] = $index;
				} else {
					$inset += 99; }
			}
			$blur = $lengths[2] ?? null;
			if ( ( null !== $blur && ! self::len( $item[ $blur ], false ) ) || $inset > 1 || $colors > 1 || \count( $lengths ) < 2 || \count( $lengths ) > 4 ) {
				return false; }
			foreach ( $lengths as $i => $index ) {
				if ( $i > 0 && $index !== $lengths[ $i - 1 ] + 1 ) {
					return false; }
			}
		}
		return true;
	}
	/**
	 * Border.
	 *
	 * @param array<array<string, mixed>> $components List.
	 */
	private static function border( array $components ): bool {
		$items = self::terms( $components );
		if ( \count( $items ) < 1 || \count( $items ) > 3 ) {
			return false; }
		$width = 0;
		$style = 0;
		$color = 0;
		foreach ( $items as $c ) {
			if ( self::len( $c, false ) || self::ident( $c, [ 'thin', 'medium', 'thick' ] ) ) {
				++$width;
			} elseif ( self::ident( $c, [ 'none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset' ] ) ) {
				++$style;
			} elseif ( self::color( $c ) ) {
				++$color;
			} else {
				return false; }
		}
		return $width <= 1 && $style <= 1 && $color <= 1;
	}
	/**
	 * Grid line.
	 *
	 * @param array<array<string, mixed>> $components List.
	 */
	private static function grid_line( array $components ): bool {
		$segments = [ [] ];
		foreach ( self::terms( $components ) as $c ) {
			if ( 'slash' === $c['t'] ) {
				$segments[] = [];
			} else {
				$segments[ \count( $segments ) - 1 ][] = $c; }
		}
		if ( \count( $segments ) > 2 ) {
			return false; }
		foreach ( $segments as $seg ) {
			$a = $seg[0] ?? null;
			$b = $seg[1] ?? null;
			if ( null === $a || \count( $seg ) > 2 ) {
				return false; }
			if ( 1 === \count( $seg ) ) {
				if ( ! ( ( 'ident' === $a['t'] && ! self::has( \array_merge( [ 'span', 'auto' ], Properties::wide() ), $a['v'] ) && ! \str_starts_with( $a['v'], '--' ) ) || self::ident( $a, [ 'auto' ] ) || ( self::integer( $a ) && 0.0 !== self::n( $a ) && \abs( self::n( $a ) ) <= 1000 ) ) ) {
					return false; }
			} elseif ( ! ( self::ident( $a, [ 'span' ] ) && null !== $b && self::integer( $b ) && self::n( $b ) >= 1 && self::n( $b ) <= 1000 ) ) {
				return false; }
		}
		return true;
	}
	/**
	 * Flex.
	 *
	 * @param array<array<string, mixed>> $components List.
	 */
	private static function flex( array $components ): bool {
		$items = self::terms( $components );
		$first = $items[0] ?? null;
		if ( null === $first ) {
			return false; }
		if ( 1 === \count( $items ) && self::ident( $first, [ 'none', 'auto' ] ) ) {
			return true; }
		$i       = 0;
		$numbers = 0;
		while ( isset( $items[ $i ] ) && 'number' === $items[ $i ]['t'] && self::n( $items[ $i ] ) >= 0 && $numbers < 2 ) {
			++$numbers;
			++$i; }
		if ( 0 === $numbers && 1 !== \count( $items ) ) {
			return false; }
		if ( \count( $items ) === $i ) {
			return $numbers > 0; }
		$basis = $items[ $i ];
		return 1 === \count( $items ) - $i && ( self::lenpct( $basis, false ) || self::ident( $basis, [ 'auto', 'content', 'min-content', 'max-content', 'fit-content' ] ) );
	}
	/**
	 * Position.
	 *
	 * @param array<array<string, mixed>> $components List.
	 */
	private static function position( array $components ): bool {
		$items = self::terms( $components );
		if ( \count( $items ) < 1 || \count( $items ) > 4 ) {
			return false; }
		$horizontal = 0;
		$vertical   = 0;
		foreach ( $items as $c ) {
			if ( ! self::ident( $c, [ 'left', 'right', 'top', 'bottom', 'center' ] ) && ! self::lenpct( $c, true ) ) {
				return false;
			} if ( self::ident( $c, [ 'left', 'right' ] ) ) {
				++$horizontal;
			} if ( self::ident( $c, [ 'top', 'bottom' ] ) ) {
				++$vertical; }
		}
		return $horizontal <= 1 && $vertical <= 1;
	}
	/**
	 * Font family.
	 *
	 * @param array<array<string, mixed>> $items Items.
	 */
	private static function font_family( array $items ): bool {
		$families = self::split( $items );
		if ( \count( $families ) > 8 ) {
			return false; }
		foreach ( $families as $family ) {
			if ( 1 === \count( $family ) && 'string' === $family[0]['t'] ) {
				continue;
			} if ( \count( $family ) < 1 || \count( $family ) > 4 ) {
				return false;
			} foreach ( $family as $c ) {
				if ( 'ident' !== $c['t'] || self::has( Properties::wide(), $c['v'] ) || \str_starts_with( $c['v'], '--' ) ) {
					return false; }
			}
		}
		return true;
	}
	/**
	 * Match kind.
	 *
	 * @param array<string, mixed>        $kind Kind.
	 * @param array<array<string, mixed>> $components List.
	 */
	private static function match_kind( array $kind, array $components ): bool {
		$items = self::terms( $components );
		$only  = 1 === \count( $items ) ? $items[0] : null;
		$k     = $kind['k'];
		$neg   = true === ( $kind['neg'] ?? false );
		$pct   = true === ( $kind['pct'] ?? false );
		$extra = $kind['extra'] ?? [];
		switch ( $k ) {
			case 'keywords':
				return null !== $only && self::ident( $only, $kind['values'] );
			case 'keyword-list':
				$seen = [];
				if ( \count( $items ) < 1 || \count( $items ) > $kind['max'] ) {
					return false;
				} foreach ( $items as $c ) {
					if ( 'ident' !== $c['t'] || ! self::has( $kind['values'], $c['v'] ) || self::has( $seen, $c['v'] ) ) {
						return false;
					} $seen[] = $c['v'];
				} return ! isset( $kind['exclusive'] ) || 1 === \count( $items ) || ! self::has( $seen, $kind['exclusive'] );
			case 'ident-list':
				$groups = self::split( $items );
				if ( \count( $groups ) > $kind['max'] ) {
					return false;
				} foreach ( $groups as $g ) {
					if ( 1 !== \count( $g ) || ! self::ident( $g[0], $kind['values'] ) ) {
						return false;
					}
				} return true;
			case 'length':
				return null !== $only && ( ( self::lenpct( $only, $neg ) && ( $pct || 'percent' !== $only['t'] ) ) || self::ident( $only, $extra ) );
			case 'box':
				if ( \count( $items ) < 1 || \count( $items ) > 4 ) {
					return false;
				} foreach ( $items as $c ) {
					if ( ! ( ( $pct ? self::lenpct( $c, $neg ) : self::len( $c, $neg ) ) || self::ident( $c, $extra ) ) ) {
						return false;
					}
				} return true;
			case 'color':
				return null !== $only && self::color( $only );
			case 'color-list':
				if ( \count( $items ) < 1 || \count( $items ) > $kind['max'] ) {
					return false;
				} foreach ( $items as $c ) {
					if ( ! self::color( $c ) ) {
						return false;
					}
				} return true;
			case 'number':
				return null !== $only && ( ( 'number' === $only['t'] && self::n( $only ) >= $kind['min'] && self::n( $only ) <= $kind['max'] ) || ( $pct && 'percent' === $only['t'] && self::n( $only ) >= $kind['min'] * 100 && self::n( $only ) <= $kind['max'] * 100 ) );
			case 'integer':
				return null !== $only && ( ( self::integer( $only ) && self::n( $only ) >= $kind['min'] && self::n( $only ) <= $kind['max'] ) || self::ident( $only, $extra ) );
			case 'font-family':
				return self::font_family( $items );
			case 'font-weight':
				return null !== $only && ( ( 'number' === $only['t'] && self::n( $only ) >= 1 && self::n( $only ) <= 1000 ) || self::ident( $only, [ 'normal', 'bold', 'lighter', 'bolder' ] ) );
			case 'line-height':
				return null !== $only && ( ( 'number' === $only['t'] && self::n( $only ) >= 0 ) || self::lenpct( $only, false ) || self::ident( $only, [ 'normal' ] ) );
			case 'shadow':
				return ( null !== $only && self::ident( $only, [ 'none' ] ) ) || self::shadow( $items );
			case 'border':
				return self::border( $items );
			case 'radius':
				if ( \count( $items ) < 1 || \count( $items ) > $kind['max'] ) {
					return false;
				} foreach ( $items as $c ) {
					if ( ! self::lenpct( $c, false ) ) {
						return false;
					}
				} return true;
			case 'background-size':
				if ( null !== $only && self::ident( $only, [ 'cover', 'contain' ] ) ) {
					return true;
				} if ( \count( $items ) < 1 || \count( $items ) > 2 ) {
					return false;
				} foreach ( $items as $c ) {
					if ( ! self::lenpct( $c, false ) && ! self::ident( $c, [ 'auto' ] ) ) {
						return false;
					}
				} return true;
			case 'position':
				return self::position( $items );
			case 'gradient':
				if ( null !== $only && self::ident( $only, [ 'none' ] ) ) {
					return true;
				} $groups = self::split( $items );
				if ( \count( $groups ) > 4 ) {
					return false;
				} foreach ( $groups as $g ) {
					if ( 1 !== \count( $g ) || 'fn' !== $g[0]['t'] || ! self::has( self::group( 'functions', 'gradient' ), $g[0]['name'] ) ) {
						return false;
					}
				} return true;
			case 'tracks':
				if ( \count( $items ) < 1 || \count( $items ) > 24 || null !== self::check_list( $items, 'tracks' ) ) {
					return false;
				} foreach ( $items as $c ) {
					if ( self::has( [ 'comma', 'slash' ], $c['t'] ) ) {
						return false;
					}
				} return true;
			case 'transform':
				if ( null !== $only && self::ident( $only, [ 'none' ] ) ) {
					return true;
				} if ( \count( $items ) < 1 || \count( $items ) > 6 ) {
					return false;
				} foreach ( $items as $c ) {
					if ( 'fn' !== $c['t'] || ! self::has( self::group( 'functions', 'transform' ), $c['name'] ) ) {
						return false;
					}
				} return true;
			case 'aspect-ratio':
				$positive = static fn( ?array $c ): bool => null !== $c && 'number' === $c['t'] && self::n( $c ) > 0;
				return ( null !== $only && self::ident( $only, [ 'auto' ] ) ) || ( 1 === \count( $items ) && $positive( $items[0] ) ) || ( 3 === \count( $items ) && $positive( $items[0] ) && 'slash' === $items[1]['t'] && $positive( $items[2] ) ) || ( \count( $items ) >= 2 && self::ident( $items[0], [ 'auto' ] ) && self::match_kind( $kind, \array_slice( $items, 1 ) ) );
			case 'flex':
				return self::flex( $items );
			case 'grid-line':
				return self::grid_line( $items );
			case 'easing':
				$groups = self::split( $items );
				if ( \count( $groups ) > $kind['max'] ) {
					return false;
				} foreach ( $groups as $g ) {
					if ( 1 !== \count( $g ) || ! ( self::ident( $g[0], self::group( 'identifiers', 'easing' ) ) || ( 'fn' === $g[0]['t'] && self::has( self::group( 'functions', 'easing' ), $g[0]['name'] ) ) ) ) {
						return false;
					}
				} return true;
			case 'times':
				$groups = self::split( $items );
				if ( \count( $groups ) > 4 ) {
					return false;
				} foreach ( $groups as $g ) {
					if ( 1 !== \count( $g ) || 'dimension' !== $g[0]['t'] || ! self::has( self::group( 'units', 'time' ), $g[0]['unit'] ) || ( ! $neg && self::n( $g[0] ) < 0 ) ) {
						return false;
					}
				} return true;
		}
		return false;
	}
	/**
	 * Matches property.
	 *
	 * @param array<string, mixed>        $kind Kind.
	 * @param array<array<string, mixed>> $components List.
	 */
	public static function matches_property( array $kind, array $components ): bool {
		$items = self::terms( $components );
		$first = $items[0] ?? null;
		if ( 1 === \count( $items ) && null !== $first && ( self::ident( $first, Properties::wide() ) || ( 'fn' === $first['t'] && 'var' === $first['name'] ) ) ) {
			return true; }
		$slots = [];
		foreach ( $components as $i => $c ) {
			if ( 'fn' === $c['t'] && 'var' === $c['name'] ) {
				$slots[] = $i; }
		}
		if ( [] === $slots ) {
			return self::match_kind( $kind, $components ); }
		$standins = [
			[
				't'    => 'dimension',
				'v'    => '1',
				'unit' => 'px',
			],
			[
				't' => 'ident',
				'v' => 'red',
			],
			[
				't' => 'number',
				'v' => '1',
			],
			[
				't' => 'ident',
				'v' => 'solid',
			],
			[
				't' => 'percent',
				'v' => '50',
			],
		];
		if ( \count( $slots ) > 4 ) {
			foreach ( $standins as $standin ) {
				$copy = $components;
				foreach ( $slots as $slot ) {
					$copy[ $slot ] = $standin;
				} if ( self::match_kind( $kind, $copy ) ) {
					return true;
				}
			} return false; }
		return self::walk( $kind, $components, $slots, $standins, 0 );
	}
	/**
	 * Walk.
	 *
	 * @param array<string, mixed>        $kind Kind.
	 * @param array<array<string, mixed>> $components List.
	 * @param array<int>                  $slots Slots.
	 * @param array<array<string, mixed>> $standins Standins.
	 * @param int                         $index Index.
	 */
	private static function walk( array $kind, array $components, array $slots, array $standins, int $index ): bool {
		if ( \count( $slots ) === $index ) {
			return self::match_kind( $kind, $components ); }
		foreach ( $standins as $standin ) {
			$copy                     = $components;
			$copy[ $slots[ $index ] ] = $standin;
			if ( self::walk( $kind, $copy, $slots, $standins, $index + 1 ) ) {
				return true; }
		}
		return false;
	}
}
