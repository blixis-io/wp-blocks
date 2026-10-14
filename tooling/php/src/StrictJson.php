<?php
/**
 * Strict fixture JSON validation, the PHP twin of tests/fixtures/src/strict-json.ts (BWB-018).
 *
 * Rejects what decoding would hide: non-integer number tokens (1.0, 1e3), negative zero, integers beyond 2^53, duplicate
 * object keys, lone surrogate escapes and nesting deeper than MAX_DEPTH.
 *
 * @package Blixis\Tooling
 */

declare(strict_types=1);

// CLI/test tooling only, never loaded inside WordPress.
// phpcs:disable WordPress.PHP.DiscouragedPHPFunctions,WordPress.Security.EscapeOutput.ExceptionNotEscaped

namespace Blixis\Tooling;

use InvalidArgumentException;

/**
 * Recursive-descent validator for strict JSON text.
 */
final class StrictJson {

	public const MAX_DEPTH = 64;

	private const MAX_SAFE_DIGITS = '9007199254740991';

	/**
	 * Current offset while scanning.
	 *
	 * @var int
	 */
	private int $pos = 0;

	/**
	 * Creates a scanner.
	 *
	 * @param string $text JSON text.
	 */
	private function __construct( private readonly string $text ) {}

	/**
	 * Validates JSON text.
	 *
	 * @param string $text JSON text.
	 * @return void
	 * @throws InvalidArgumentException When the text breaks a rule.
	 */
	public static function assert_valid( string $text ): void {
		$scanner = new self( $text );
		$scanner->value( 0 );
		$scanner->skip_whitespace();
		if ( strlen( $text ) !== $scanner->pos ) {
			$scanner->fail( 'unexpected content after the value' );
		}
	}

	/**
	 * Throws with the current offset.
	 *
	 * @param string $message Reason.
	 * @return never
	 * @throws InvalidArgumentException Always.
	 */
	private function fail( string $message ): never {
		throw new InvalidArgumentException( 'invalid fixture JSON at offset ' . $this->pos . ': ' . $message );
	}

	/**
	 * Skips JSON whitespace.
	 *
	 * @return void
	 */
	private function skip_whitespace(): void {
		$length = strlen( $this->text );
		while ( $this->pos < $length && str_contains( " \t\n\r", $this->text[ $this->pos ] ) ) {
			++$this->pos;
		}
	}

	/**
	 * Validates one value.
	 *
	 * @param int $depth Containers entered so far.
	 * @return void
	 */
	private function value( int $depth ): void {
		$this->skip_whitespace();
		$char = $this->text[ $this->pos ] ?? '';
		if ( '{' === $char || '[' === $char ) {
			$this->container( $char, $depth );
			return;
		}
		if ( '"' === $char ) {
			$this->string();
			return;
		}
		if ( '-' === $char || ( '' !== $char && ctype_digit( $char ) ) ) {
			$this->number();
			return;
		}
		foreach ( array( 'true', 'false', 'null' ) as $literal ) {
			if ( substr( $this->text, $this->pos, strlen( $literal ) ) === $literal ) {
				$this->pos += strlen( $literal );
				return;
			}
		}
		$this->fail( 'unexpected token' );
	}

	/**
	 * Validates an object or array.
	 *
	 * @param string $open  Opening character.
	 * @param int    $depth Containers entered so far.
	 * @return void
	 */
	private function container( string $open, int $depth ): void {
		if ( $depth + 1 > self::MAX_DEPTH ) {
			$this->fail( 'nesting deeper than ' . self::MAX_DEPTH );
		}
		++$this->pos;
		$this->skip_whitespace();
		$close = '{' === $open ? '}' : ']';
		if ( ( $this->text[ $this->pos ] ?? '' ) === $close ) {
			++$this->pos;
			return;
		}
		$keys = array();
		while ( true ) {
			$this->skip_whitespace();
			if ( '{' === $open ) {
				if ( ( $this->text[ $this->pos ] ?? '' ) !== '"' ) {
					$this->fail( 'object key must be a string' );
				}
				$key = $this->string();
				if ( isset( $keys[ 'k' . $key ] ) ) {
					$this->fail( 'duplicate key "' . $key . '"' );
				}
				$keys[ 'k' . $key ] = true;
				$this->skip_whitespace();
				if ( ( $this->text[ $this->pos ] ?? '' ) !== ':' ) {
					$this->fail( 'expected ":"' );
				}
				++$this->pos;
			}
			$this->value( $depth + 1 );
			$this->skip_whitespace();
			$next = $this->text[ $this->pos ] ?? '';
			++$this->pos;
			if ( $next === $close ) {
				return;
			}
			if ( ',' !== $next ) {
				$this->fail( 'expected "," or "' . $close . '"' );
			}
		}
	}

	/**
	 * Validates a string and returns its decoded value.
	 *
	 * @return string
	 */
	private function string(): string {
		$start = $this->pos;
		++$this->pos;
		$length = strlen( $this->text );
		while ( $this->pos < $length && '"' !== $this->text[ $this->pos ] ) {
			if ( '\\' === $this->text[ $this->pos ] ) {
				++$this->pos;
			} elseif ( ord( $this->text[ $this->pos ] ) < 0x20 ) {
				$this->fail( 'control character in string' );
			}
			++$this->pos;
		}
		if ( $this->pos >= $length ) {
			$this->fail( 'unterminated string' );
		}
		++$this->pos;
		$decoded = json_decode( substr( $this->text, $start, $this->pos - $start ) );
		if ( ! is_string( $decoded ) ) {
			$this->fail( 'invalid string (bad escape, invalid UTF-8 or lone surrogate)' );
		}
		return $decoded;
	}

	/**
	 * Validates a number token: integers only, no negative zero, nothing beyond 2^53 - 1.
	 *
	 * @return void
	 */
	private function number(): void {
		if ( 1 !== preg_match( '/\G-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/', $this->text, $match, 0, $this->pos ) ) {
			$this->fail( 'invalid number' );
		}
		$token = $match[0];
		if ( 1 === preg_match( '/[.eE]/', $token ) ) {
			$this->fail( 'non-integer number ' . $token . '; use a string' );
		}
		if ( '-0' === $token ) {
			$this->fail( 'negative zero is not allowed' );
		}
		$digits = ltrim( $token, '-' );
		if ( strlen( $digits ) > strlen( self::MAX_SAFE_DIGITS ) || ( strlen( $digits ) === strlen( self::MAX_SAFE_DIGITS ) && strcmp( $digits, self::MAX_SAFE_DIGITS ) > 0 ) ) {
			$this->fail( 'integer ' . $token . ' is beyond 2^53; use a string' );
		}
		$this->pos += strlen( $token );
	}
}
