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

	/**
	 * Number tokens that JSON decoders would silently normalise are rejected.
	 *
	 * @param string $json Input.
	 */
	#[DataProvider( 'strict_json_rejections' )]
	public function test_strict_json_rejects_ambiguous_input( string $json ): void {
		$this->expectException( InvalidArgumentException::class );
		Fixtures::decode( $json );
	}

	/**
	 * Inputs that must be rejected identically in TypeScript (see tests/fixtures/src/strict-json.test.ts).
	 *
	 * @return array<string, array{string}>
	 */
	public static function strict_json_rejections(): array {
		return array(
			'1.0'                  => array( '{"a":1.0}' ),
			'1e3'                  => array( '{"a":1e3}' ),
			'-0'                   => array( '{"a":-0}' ),
			'-0.0'                 => array( '{"a":-0.0}' ),
			'unsafe integer'       => array( '{"a":9007199254740992}' ),
			'duplicate key'        => array( '{"a":1,"a":2}' ),
			'duplicate nested key' => array( '{"x":{"a":1,"a":1}}' ),
			'lone high surrogate'  => array( '{"a":"\\ud800"}' ),
			'lone low surrogate'   => array( '{"\\udc00":1}' ),
			'trailing comma'       => array( '[1,]' ),
			'single quotes'        => array( "{'a':1}" ),
			'trailing content'     => array( '{} {}' ),
			'unquoted key'         => array( '{a:1}' ),
			'raw control char'     => array( "[\"a\tb\"]" ),
			'leading zero'         => array( '[01]' ),
			'plus sign'            => array( '[+1]' ),
		);
	}

	/**
	 * Nesting at the shared limit is accepted, one level deeper is rejected.
	 */
	public function test_nesting_limit_is_shared_with_typescript(): void {
		$ok = str_repeat( '[', 64 ) . str_repeat( ']', 64 );
		$this->assertSame( $ok, Fixtures::canonical_json( Fixtures::decode( $ok ) ) );
		$this->expectException( InvalidArgumentException::class );
		Fixtures::decode( str_repeat( '[', 65 ) . str_repeat( ']', 65 ) );
	}

	/**
	 * Duplicate ids across a fixture tree are rejected, and the committed tree loads.
	 */
	public function test_load_all_requires_unique_ids(): void {
		$all = Fixtures::load_all( dirname( __DIR__, 3 ) . '/tests/fixtures' );
		$this->assertGreaterThanOrEqual( 4, count( $all ) );
		$dir = sys_get_temp_dir() . '/blx-fixtures-' . bin2hex( random_bytes( 4 ) );
		mkdir( $dir . '/a', 0777, true );
		mkdir( $dir . '/b', 0777, true );
		$body = '{"description":"d","expected":{},"fixtureVersion":1,"id":"same","input":{},"tags":[]}' . "\n";
		file_put_contents( $dir . '/a/same.fixture.json', $body );
		file_put_contents( $dir . '/b/same.fixture.json', $body );
		try {
			$this->expectException( InvalidArgumentException::class );
			$this->expectExceptionMessage( 'duplicate fixture id' );
			Fixtures::load_all( $dir );
		} finally {
			unlink( $dir . '/a/same.fixture.json' );
			unlink( $dir . '/b/same.fixture.json' );
			rmdir( $dir . '/a' );
			rmdir( $dir . '/b' );
			rmdir( $dir );
		}
	}

	/**
	 * Envelope fields are validated like in TypeScript.
	 *
	 * @param string $body Fixture file content.
	 */
	#[DataProvider( 'bad_envelopes' )]
	public function test_envelope_validation_matches_typescript( string $body ): void {
		$dir = sys_get_temp_dir() . '/blx-env-' . bin2hex( random_bytes( 4 ) );
		mkdir( $dir );
		$file = $dir . '/sample.fixture.json';
		file_put_contents( $file, $body );
		try {
			$this->expectException( InvalidArgumentException::class );
			Fixtures::load( $file );
		} finally {
			unlink( $file );
			rmdir( $dir );
		}
	}

	/**
	 * Malformed envelopes.
	 *
	 * @return array<string, array{string}>
	 */
	public static function bad_envelopes(): array {
		$base = static fn ( string $patch ): string => '{"description":"d","expected":{},"fixtureVersion":1,"id":"sample","input":{},"tags":["a"]' . $patch . "}\n";
		return array(
			'blank description' => array( '{"description":" ","expected":{},"fixtureVersion":1,"id":"sample","input":{},"tags":[]}' . "\n" ),
			'bad tag'           => array( '{"description":"d","expected":{},"fixtureVersion":1,"id":"sample","input":{},"tags":["Bad_Tag"]}' . "\n" ),
			'non-string tag'    => array( '{"description":"d","expected":{},"fixtureVersion":1,"id":"sample","input":{},"tags":[1]}' . "\n" ),
			'tags not array'    => array( '{"description":"d","expected":{},"fixtureVersion":1,"id":"sample","input":{},"tags":"a"}' . "\n" ),
			'extra key'         => array( $base( ',"extra":1' ) ),
			'wrong id'          => array( '{"description":"d","expected":{},"fixtureVersion":1,"id":"other","input":{},"tags":[]}' . "\n" ),
			'wrong version'     => array( '{"description":"d","expected":{},"fixtureVersion":2,"id":"sample","input":{},"tags":[]}' . "\n" ),
			'no final newline'  => array( '{"description":"d","expected":{},"fixtureVersion":1,"id":"sample","input":{},"tags":[]}' ),
			'CRLF'              => array( "{\"description\":\"d\",\"expected\":{},\"fixtureVersion\":1,\"id\":\"sample\",\"input\":{},\"tags\":[]}\r\n" ),
		);
	}
}
