<?php
/**
 * Bounded PHP twin of the design-token set policy.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Tokens;

use Blixis\Builder\Css\DeclarationValidator;
use Blixis\Builder\Css\Tokenizer;
use Blixis\Builder\Registry\SafeUrl;

\defined( 'ABSPATH' ) || exit;

/** Validates, resolves and prepares design tokens without WordPress state. */
final class TokenSet {
	private const GRAMMAR = [
		'color'       => 'color',
		'font-family' => 'font-family',
		'font-size'   => 'font-size',
		'spacing'     => 'row-gap',
		'radius'      => 'border-top-left-radius',
		'container'   => 'max-width',
		'shadow'      => 'box-shadow',
	];

	/**
	 * Validate a JSON-decoded token set. Invalid input never reaches CSS compilation.
	 *
	 * @param mixed $input Untrusted value.
	 * @return array{ok:true,issues:array{},set:\stdClass}|array{ok:false,issues:list<array{code:string,path:string}>}
	 */
	public static function validateTokenSet( mixed $input ): array { // phpcs:ignore WordPress.NamingConventions.ValidFunctionName.MethodNameInvalid -- Shared TypeScript contract.
		$reserved = self::reserved( $input );
		if ( null !== $reserved ) {
			return self::bad( [ self::issue( 'reserved-key', $reserved ) ] );
		}
		$shape = self::shape( $input );
		if ( [] !== $shape ) {
			return self::bad( \array_slice( $shape, 0, 50 ) );
		}
		$tokens  = $input->tokens;
		$issues  = [];
		$failed  = [];
		$by_name = [];
		foreach ( $tokens as $index => $token ) {
			$by_name[ $token->name ] ??= $token;
		}
		foreach ( $tokens as $index => $token ) {
			foreach ( [ 'value', 'dark' ] as $field ) {
				if ( ! \property_exists( $token, $field ) ) {
					continue;
				}
				$path  = 'tokens[' . $index . '].' . $field;
				$check = DeclarationValidator::validate( self::GRAMMAR[ $token->category ], $token->$field );
				if ( ! $check->ok ) {
					$failed[ $path ] = true;
					$issues[]        = self::issue( 'invalid-value', $path );
					continue;
				}
				$alias = self::alias( $token->$field );
				if ( null !== $alias && isset( $by_name[ $alias ] ) && $by_name[ $alias ]->category !== $token->category ) {
					$issues[] = self::issue( 'category-mismatch', $path );
				}
			}
		}
		$seen = [];
		foreach ( $tokens as $index => $token ) {
			if ( isset( $seen[ $token->name ] ) ) {
				$issues[] = self::issue( 'duplicate-name', 'tokens[' . $index . '].name' );
			}
			$seen[ $token->name ] = true;
		}
		$reported = [];
		foreach ( [ 'light', 'dark' ] as $mode ) {
			$resolution = self::resolveTokens( $input, $mode );
			foreach ( $resolution['issues'] as $issue ) {
				$key = $issue['code'] . '|' . $issue['path'];
				if ( ! isset( $reported[ $key ] ) ) {
					$issues[]         = $issue;
					$reported[ $key ] = true;
				}
			}
		}
		foreach ( [ 'light', 'dark' ] as $mode ) {
			$values = self::resolveTokens( $input, $mode )['values'];
			foreach ( $tokens as $index => $token ) {
				$field = 'dark' === $mode && \property_exists( $token, 'dark' ) ? 'dark' : 'value';
				$path  = 'tokens[' . $index . '].' . $field;
				if ( ! isset( $values[ $token->name ] ) || isset( $failed[ $path ] ) || ( 'dark' === $mode && 'value' === $field ) ) {
					continue;
				}
				if ( ! DeclarationValidator::validate( self::GRAMMAR[ $token->category ], $values[ $token->name ] )->ok ) {
					$issues[]        = self::issue( 'invalid-resolved-value', $path );
					$failed[ $path ] = true;
				}
			}
		}
		return [] === $issues ? [
			'ok'     => true,
			'issues' => [],
			'set'    => $input,
		] : self::bad( \array_slice( $issues, 0, 50 ) );
	}

	/**
	 * Resolve references for one mode, preserving token order.
	 *
	 * @param \stdClass $set Shape-valid set.
	 * @param string    $mode Light or dark.
	 * @return array{values:array<string,string>,issues:list<array{code:string,path:string}>}
	 */
	public static function resolveTokens( \stdClass $set, string $mode ): array { // phpcs:ignore WordPress.NamingConventions.ValidFunctionName.MethodNameInvalid -- Shared TypeScript contract.
		$first = [];
		foreach ( $set->tokens as $index => $token ) {
			$first[ $token->name ] ??= [ $token, $index ];
		}
		$values = [];
		$issues = [];
		$memo   = [];
		foreach ( $first as $name => [ $token, $index ] ) {
			$field  = 'dark' === $mode && \property_exists( $token, 'dark' ) ? 'dark' : 'value';
			$result = self::resolve_name( $name, $mode, $first, [], $memo );
			if ( $result['ok'] ) {
				$values[ $name ] = $result['value'];
			} else {
				$issues[] = self::issue( $result['code'], 'tokens[' . $index . '].' . $field );
			}
		}
		return [
			'values' => $values,
			'issues' => $issues,
		];
	}

	/**
	 * Compiler input from a validated set; mode overrides remain sparse.
	 *
	 * @param \stdClass $set Validated set.
	 * @return list<array<string,string>>
	 */
	public static function tokensForCompile( \stdClass $set ): array { // phpcs:ignore WordPress.NamingConventions.ValidFunctionName.MethodNameInvalid -- Shared TypeScript contract.
		$out = [];
		foreach ( $set->tokens as $token ) {
			$name  = '--blx-' . $token->name;
			$out[] = [
				'name'  => $name,
				'value' => $token->value,
			];
			if ( \property_exists( $token, 'dark' ) && $token->dark !== $token->value ) {
				$out[] = [
					'name'  => $name,
					'value' => $token->dark,
					'mode'  => 'dark',
				];
			}
		}
		return $out;
	}

	/**
	 * Resolve a named token with cycle and chain bounds.
	 *
	 * @param string                                               $name Token name.
	 * @param string                                               $mode Light or dark.
	 * @param array<string,array{\stdClass,int}>                   $first First definitions.
	 * @param array                                                $stack Active chain.
	 * @phpstan-param list<string> $stack
	 * @param array<string,array{ok:true,value:string,height:int}> $memo Resolved tokens in this mode.
	 * @return array{ok:true,value:string,height:int}|array{ok:false,code:string}
	 */
	private static function resolve_name( string $name, string $mode, array $first, array $stack, array &$memo ): array {
		if ( isset( $memo[ $name ] ) ) {
			return $memo[ $name ];
		}
		if ( \in_array( $name, $stack, true ) ) {
			return [
				'ok'   => false,
				'code' => 'reference-cycle',
			];
		}
		$stack[] = $name;
		$token   = $first[ $name ][0];
		$text    = 'dark' === $mode && \property_exists( $token, 'dark' ) ? $token->dark : $token->value;
		$result  = self::expand( $text, $mode, $first, $stack, $memo );
		if ( ! $result['ok'] ) {
			return $result;
		}
		$height = $result['height'] + 1;
		if ( $height > 16 ) {
			return [
				'ok'   => false,
				'code' => 'reference-too-deep',
			];
		}
		$memo[ $name ] = [
			'ok'     => true,
			'value'  => $result['value'],
			'height' => $height,
		];
		return $memo[ $name ];
	}

	/**
	 * Expand outer var() calls; nested fallbacks are scanned on demand.
	 *
	 * @param string                                               $text CSS value.
	 * @param string                                               $mode Light or dark.
	 * @param array<string,array{\stdClass,int}>                   $first First definitions.
	 * @param array                                                $stack Active chain.
	 * @phpstan-param list<string> $stack
	 * @param array<string,array{ok:true,value:string,height:int}> $memo Resolved tokens in this mode.
	 * @return array{ok:true,value:string,height:int}|array{ok:false,code:string}
	 */
	private static function expand( string $text, string $mode, array $first, array $stack, array &$memo ): array {
		$out    = '';
		$offset = 0;
		$height = 0;
		while ( true ) {
			$start = \strpos( $text, 'var(', $offset );
			if ( false === $start ) {
				break;
			}
			$depth = 1;
			$end   = $start + 4;
			for ( $length = \strlen( $text ); $end < $length && $depth > 0; ++$end ) {
				$depth += '(' === $text[ $end ] ? 1 : ( ')' === $text[ $end ] ? -1 : 0 );
			}
			if ( 0 !== $depth ) {
				break;
			}
			$inner = \substr( $text, $start + 4, $end - $start - 5 );
			if ( 1 !== \preg_match( '/^\s*--blx-([a-z0-9]+(?:-[a-z0-9]+)*)\s*(?:,([\s\S]*))?$/D', $inner, $match ) ) {
				return [
					'ok'   => false,
					'code' => 'invalid-reference',
				];
			}
			$name = $match[1];
			if ( isset( $first[ $name ] ) ) {
				$piece = self::resolve_name( $name, $mode, $first, $stack, $memo );
			} elseif ( isset( $match[2] ) ) {
				$piece = self::expand( \trim( $match[2] ), $mode, $first, $stack, $memo );
			} else {
				return [
					'ok'   => false,
					'code' => 'unknown-reference',
				];
			}
			if ( ! $piece['ok'] ) {
				return $piece;
			}
			$out   .= \substr( $text, $offset, $start - $offset ) . $piece['value'];
			$height = \max( $height, $piece['height'] );
			$offset = $end;
		}
		$out .= \substr( $text, $offset );
		return SafeUrl::utf16_length( $out ) > 8192 ? [
			'ok'   => false,
			'code' => 'expansion-too-large',
		] : [
			'ok'     => true,
			'value'  => $out,
			'height' => $height,
		];
	}

	/**
	 * Alias name when the entire value is one var() expression.
	 *
	 * @param string $value CSS value.
	 */
	private static function alias( string $value ): ?string {
		$parsed = Tokenizer::parse( $value, true );
		$only   = $parsed['ok'] && 1 === \count( $parsed['components'] ) ? $parsed['components'][0] : null;
		$name   = 'fn' === ( $only['t'] ?? null ) && 'var' === ( $only['name'] ?? null ) ? ( $only['children'][0] ?? null ) : null;
		return 'ident' === ( $name['t'] ?? null ) && 1 === \preg_match( '/^--blx-([a-z0-9]+(?:-[a-z0-9]+)*)$/D', $name['v'], $match ) ? $match[1] : null;
	}

	/**
	 * Find reserved object keys without consuming unbounded input.
	 *
	 * @param mixed  $value Input subtree.
	 * @param string $path Issue path.
	 * @param int    $depth Current depth.
	 */
	private static function reserved( mixed $value, string $path = '$', int $depth = 0 ): ?string {
		if ( $depth > 32 ) {
			return null;
		}
		if ( $value instanceof \stdClass ) {
			foreach ( \get_object_vars( $value ) as $key => $child ) {
				if ( \in_array( $key, [ '__proto__', 'constructor', 'prototype' ], true ) ) {
					return $path . '.' . $key;
				}
				$found = self::reserved( $child, $path . '.' . $key, $depth + 1 );
				if ( null !== $found ) {
					return $found;
				}
			}
		} elseif ( \is_array( $value ) ) {
			foreach ( $value as $index => $child ) {
				$found = self::reserved( $child, $path . '.' . $index, $depth + 1 );
				if ( null !== $found ) {
					return $found;
				}
			}
		}
		return null;
	}

	/**
	 * Shape checks in schema order.
	 *
	 * @param mixed $input Input value.
	 * @return list<array{code:string,path:string}>
	 */
	private static function shape( mixed $input ): array {
		if ( ! $input instanceof \stdClass ) {
			return [ self::issue( 'schema', '$' ) ];
		}
		$issues = [];
		if ( 1 !== ( $input->{'schemaVersion'} ?? null ) ) {
			$issues[] = self::issue( 'schema', '$.schemaVersion' );
		}
		if ( ! \is_int( $input->{'tokenVersion'} ?? null ) || $input->{'tokenVersion'} < 0 || $input->{'tokenVersion'} > 9007199254740991 ) {
			$issues[] = self::issue( 'schema', '$.tokenVersion' );
		}
		if ( ! \is_array( $input->tokens ?? null ) || \count( $input->tokens ) > 500 ) {
			$issues[] = self::issue( 'schema', '$.tokens' );
			return $issues;
		}
		foreach ( $input->tokens as $index => $token ) {
			if ( ! $token instanceof \stdClass ) {
				$issues[] = self::issue( 'schema', '$.tokens.' . $index );
				continue;
			}
			foreach ( [ 'name', 'category', 'value', 'dark', 'label' ] as $field ) {
				$value = $token->$field ?? null;
				if ( null === $value && \in_array( $field, [ 'dark', 'label' ], true ) && ! \property_exists( $token, $field ) ) {
					continue;
				}
				$valid = \is_string( $value ) && match ( $field ) {
					'name' => SafeUrl::utf16_length( $value ) <= 48 && 1 === \preg_match( '/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/D', $value ),
					'category' => isset( self::GRAMMAR[ $value ] ),
					'label' => '' !== $value && SafeUrl::utf16_length( $value ) <= 80,
					default => '' !== $value && SafeUrl::utf16_length( $value ) <= 512,
				};
				if ( ! $valid ) {
					$issues[] = self::issue( 'schema', '$.tokens.' . $index . '.' . $field );
				}
			}
		}
		return $issues;
	}

	/**
	 * One stable issue.
	 *
	 * @param string $code Issue code.
	 * @param string $path Issue path.
	 * @return array{code:string,path:string}
	 */
	private static function issue( string $code, string $path ): array {
		return [
			'code' => $code,
			'path' => $path,
		];
	}

	/**
	 * Rejected result.
	 *
	 * @param list<array{code:string,path:string}> $issues Issues.
	 * @return array{ok:false,issues:list<array{code:string,path:string}>}
	 */
	private static function bad( array $issues ): array {
		return [
			'ok'     => false,
			'issues' => $issues,
		];
	}
}
