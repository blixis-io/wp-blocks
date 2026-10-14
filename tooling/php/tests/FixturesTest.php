<?php
/**
 * Tests for the PHP fixture helpers (BWB-018).
 *
 * @package Blixis\Tooling
 */

declare(strict_types=1);

namespace Blixis\Tooling\Tests;

use Blixis\Tooling\Fixtures;
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Canonical JSON and fixture validation rules.
 */
final class FixturesTest extends TestCase {

	/**
	 * Keys are sorted by byte order at every depth, with no whitespace.
	 */
	public function test_canonical_json_sorts_keys_recursively(): void {
		$value = Fixtures::decode( '{"b":1,"a":{"z":[{"y":2,"x":1}],"c":null}}' );
		$this->assertSame( '{"a":{"c":null,"z":[{"x":1,"y":2}]},"b":1}', Fixtures::canonical_json( $value ) );
	}

	/**
	 * Empty objects and arrays keep their type.
	 */
	public function test_empty_object_and_array_are_preserved(): void {
		$this->assertSame( '{"a":{},"b":[]}', Fixtures::canonical_json( Fixtures::decode( '{"b":[],"a":{}}' ) ) );
	}

	/**
	 * Slashes and non-ASCII characters are not escaped.
	 */
	public function test_slashes_and_unicode_are_not_escaped(): void {
		$this->assertSame( '{"k":"a/b é 日本 😀"}', Fixtures::canonical_json( Fixtures::decode( '{"k":"a\/b é 日本 😀"}' ) ) );
	}

	/**
	 * Non-integer numbers and unsafe integers are rejected.
	 *
	 * @param string $json Input.
	 */
	#[DataProvider( 'unsafe_numbers' )]
	public function test_unsafe_numbers_are_rejected( string $json ): void {
		$this->expectException( InvalidArgumentException::class );
		Fixtures::decode( $json );
	}

	/**
	 * Inputs the rules forbid.
	 *
	 * @return array<string, array{string}>
	 */
	public static function unsafe_numbers(): array {
		return array(
			'float'         => array( '{"a":1.5}' ),
			'float integer' => array( '{"a":1.0}' ),
			'exponent'      => array( '{"a":1e3}' ),
			'unsafe int'    => array( '{"a":9007199254740993}' ),
			'nested'        => array( '{"a":[{"b":0.1}]}' ),
		);
	}

	/**
	 * Strings and keys that are not NFC are rejected.
	 */
	public function test_non_nfc_text_is_rejected(): void {
		$decomposed = "e\u{0301}"; // "e" followed by a combining acute accent.
		$json       = json_encode( array( 'k' => $decomposed ) );
		$this->assertIsString( $json );
		$this->expectException( InvalidArgumentException::class );
		Fixtures::decode( $json );
	}

	/**
	 * Every committed fixture loads and has a stable hash.
	 */
	public function test_all_committed_fixtures_load(): void {
		$all      = array();
		$iterator = new \RecursiveIteratorIterator( new \RecursiveDirectoryIterator( dirname( __DIR__, 3 ) . '/tests/fixtures', \FilesystemIterator::SKIP_DOTS ) );
		foreach ( $iterator as $file ) {
			if ( $file instanceof \SplFileInfo && str_ends_with( $file->getFilename(), '.fixture.json' ) && ! str_contains( $file->getPathname(), 'node_modules' ) ) {
				$all[] = $file->getPathname();
			}
		}
		$this->assertNotEmpty( $all );
		foreach ( $all as $file ) {
			$fixture = Fixtures::load( $file );
			$this->assertMatchesRegularExpression( '/^[0-9a-f]{64}$/', Fixtures::canonical_hash( $fixture ) );
		}
	}
}
