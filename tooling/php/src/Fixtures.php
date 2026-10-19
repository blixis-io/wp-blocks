<?php
/**
 * Fixture loading and canonical JSON, the PHP twin of tests/fixtures/src (BWB-018).
 *
 * Both implementations must produce byte-identical canonical JSON for every fixture; tests/fixtures/src/parity.test.ts
 * enforces it.
 *
 * @package Blixis\Tooling
 */

declare(strict_types=1);

// CLI/test tooling only, never loaded inside WordPress: native file and JSON functions are intended, and JSON keys
// such as `fixtureVersion` are camelCase by contract.
// phpcs:disable WordPress.WP.AlternativeFunctions,WordPress.PHP.DiscouragedPHPFunctions,WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase

namespace Blixis\Tooling;

use InvalidArgumentException;
use JsonException;
use RuntimeException;
use stdClass;

/**
 * Reads `*.fixture.json` files and serialises values canonically.
 */
final class Fixtures {

	private const MAX_SAFE_INTEGER = 9007199254740991;

	/**
	 * Decodes JSON and checks the fixture value rules: null, booleans, safe integers, bounded decimals, NFC strings, arrays, objects.
	 *
	 * @param string $json JSON text.
	 * @return mixed Objects are stdClass so that empty objects stay objects.
	 * @throws InvalidArgumentException When the JSON is invalid or breaks a rule.
	 */
	public static function decode( string $json ): mixed {
		StrictJson::assert_valid( $json );
		try {
			$value = json_decode( $json, false, StrictJson::MAX_DEPTH + 1, JSON_THROW_ON_ERROR );
		} catch ( JsonException $e ) {
			throw new InvalidArgumentException( 'Invalid JSON: ' . $e->getMessage(), 0, $e ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- CLI tooling.
		}
		self::assert_value( $value, '$' );
		return $value;
	}

	/**
	 * Canonical JSON: keys sorted by UTF-8 byte order at every level, no whitespace, unescaped slashes and Unicode.
	 *
	 * @param mixed $value A value returned by decode().
	 * @return string
	 */
	public static function canonical_json( mixed $value ): string {
		self::assert_value( $value, '$' );
		return json_encode( self::sort_keys( $value ), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_LINE_TERMINATORS | JSON_THROW_ON_ERROR );
	}

	/**
	 * SHA-256 of the canonical JSON.
	 *
	 * @param mixed $value A value returned by decode().
	 * @return string
	 */
	public static function canonical_hash( mixed $value ): string {
		return hash( 'sha256', self::canonical_json( $value ) );
	}

	/**
	 * Loads one fixture envelope and validates it.
	 *
	 * @param string $path Absolute path to a `*.fixture.json` file.
	 * @return stdClass The decoded envelope.
	 * @throws RuntimeException When the file cannot be read.
	 * @throws InvalidArgumentException When the envelope is invalid.
	 */
	public static function load( string $path ): stdClass {
		$text = file_get_contents( $path );
		if ( false === $text ) {
			throw new RuntimeException( 'Cannot read fixture file.' ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- CLI tooling.
		}
		if ( str_contains( $text, "\r" ) || ! str_ends_with( $text, "\n" ) || str_ends_with( $text, "\n\n" ) ) {
			throw new InvalidArgumentException( 'Fixtures must use LF endings and end with exactly one newline.' ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- CLI tooling.
		}
		$fixture = self::decode( $text );
		if ( ! $fixture instanceof stdClass ) {
			throw new InvalidArgumentException( 'A fixture must be a JSON object.' ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- CLI tooling.
		}
		$keys = array_keys( get_object_vars( $fixture ) );
		sort( $keys, SORT_STRING );
		if ( [ 'description', 'expected', 'fixtureVersion', 'id', 'input', 'tags' ] !== $keys ) {
			throw new InvalidArgumentException( 'Fixture keys must be exactly description, expected, fixtureVersion, id, input, tags.' ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- CLI tooling.
		}
		if ( 1 !== $fixture->fixtureVersion ) {
			throw new InvalidArgumentException( 'fixtureVersion must be 1.' ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- CLI tooling.
		}
		if ( ! is_string( $fixture->id ) || 1 !== preg_match( '/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $fixture->id ) ) {
			throw new InvalidArgumentException( 'id must be kebab-case.' ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- CLI tooling.
		}
		if ( basename( $path, '.fixture.json' ) !== $fixture->id ) {
			throw new InvalidArgumentException( 'id must equal the file name.' ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- CLI tooling.
		}
		if ( ! is_string( $fixture->description ) || '' === trim( $fixture->description ) ) {
			throw new InvalidArgumentException( 'description is required.' ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- CLI tooling.
		}
		if ( ! is_array( $fixture->tags ) ) {
			throw new InvalidArgumentException( 'tags must be an array of kebab-case strings.' ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- CLI tooling.
		}
		foreach ( $fixture->tags as $tag ) {
			if ( ! is_string( $tag ) || 1 !== preg_match( '/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $tag ) ) {
				throw new InvalidArgumentException( 'tags must be an array of kebab-case strings.' ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- CLI tooling.
			}
		}
		return $fixture;
	}

	/**
	 * Loads every `*.fixture.json` below a directory (sorted) and requires unique ids across the whole tree.
	 *
	 * @param string $dir Directory to scan recursively.
	 * @return list<stdClass>
	 * @throws InvalidArgumentException On an invalid envelope or a duplicate id.
	 */
	public static function load_all( string $dir ): array {
		$files    = [];
		$iterator = new \RecursiveIteratorIterator( new \RecursiveDirectoryIterator( $dir, \FilesystemIterator::SKIP_DOTS ) );
		foreach ( $iterator as $file ) {
			if ( $file instanceof \SplFileInfo && str_ends_with( $file->getFilename(), '.fixture.json' ) && ! str_contains( $file->getPathname(), 'node_modules' ) && ! str_contains( $file->getPathname(), '/tests/fixtures/render/' ) ) {
				$files[] = $file->getPathname();
			}
		}
		sort( $files, SORT_STRING );
		$seen     = [];
		$fixtures = [];
		foreach ( $files as $file ) {
			$fixture = self::load( $file );
			$id      = (string) $fixture->id;
			if ( isset( $seen[ $id ] ) ) {
				throw new InvalidArgumentException( 'duplicate fixture id "' . $id . '" in ' . $file . ' and ' . $seen[ $id ] ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- CLI tooling.
			}
			$seen[ $id ] = $file;
			$fixtures[]  = $fixture;
		}
		return $fixtures;
	}

	/**
	 * Sorts object keys recursively.
	 *
	 * @param mixed $value Decoded value.
	 * @return mixed
	 */
	private static function sort_keys( mixed $value ): mixed {
		if ( is_array( $value ) ) {
			return array_map( [ self::class, 'sort_keys' ], $value );
		}
		if ( $value instanceof stdClass ) {
			$vars = get_object_vars( $value );
			ksort( $vars, SORT_STRING );
			$sorted = new stdClass();
			foreach ( $vars as $key => $item ) {
				$sorted->{ (string) $key} = self::sort_keys( $item );
			}
			return $sorted;
		}
		return $value;
	}

	/**
	 * Throws when a value breaks the fixture rules.
	 *
	 * @param mixed  $value Value to check.
	 * @param string $path  Location for the error message.
	 * @return void
	 * @throws InvalidArgumentException On a rule violation.
	 */
	private static function assert_value( mixed $value, string $path ): void {
		if ( null === $value || is_bool( $value ) ) {
			return;
		}
		if ( is_int( $value ) ) {
			if ( abs( $value ) > self::MAX_SAFE_INTEGER ) {
				throw new InvalidArgumentException( $path . ': integers beyond 2^53 are not allowed; use a string.' ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- CLI tooling.
			}
			return;
		}
		if ( is_float( $value ) ) {
			if ( ! is_finite( $value ) || abs( $value ) < 0.0001 || abs( $value ) > 1000000000 || (float) rtrim( rtrim( number_format( $value, 4, '.', '' ), '0' ), '.' ) !== $value ) {
				throw new InvalidArgumentException( $path . ': number is outside the canonical integer/decimal range.' ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- CLI tooling.
			}
			return;
		}
		if ( is_string( $value ) ) {
			self::assert_nfc( $value, $path );
			return;
		}
		if ( is_array( $value ) ) {
			foreach ( $value as $index => $item ) {
				self::assert_value( $item, $path . '[' . $index . ']' );
			}
			return;
		}
		if ( $value instanceof stdClass ) {
			foreach ( get_object_vars( $value ) as $key => $item ) {
				self::assert_nfc( (string) $key, $path );
				self::assert_value( $item, $path . '.' . $key );
			}
			return;
		}
		throw new InvalidArgumentException( $path . ': unsupported value type.' ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- CLI tooling.
	}

	/**
	 * Requires NFC-normalised text (needs ext-intl).
	 *
	 * @param string $text Text to check.
	 * @param string $path Location for the error message.
	 * @return void
	 * @throws InvalidArgumentException When the text is not NFC.
	 */
	private static function assert_nfc( string $text, string $path ): void {
		if ( ! \Normalizer::isNormalized( $text, \Normalizer::FORM_C ) ) {
			throw new InvalidArgumentException( $path . ': strings must be NFC-normalised.' ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- CLI tooling.
		}
	}
}
