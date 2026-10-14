<?php
/**
 * Cross-language contract tests, PHP side (BWB-027).
 *
 * Reads tests/fixtures/contracts.json, the registry of every shared data file, and checks what the PHP side can already
 * check: every file is strict, canonical-capable JSON, runners and roadmap issues exist, and the document and token fixtures
 * agree with the JSON Schemas generated from the TypeScript schemas. Suites whose PHP implementation does not exist yet are
 * listed as pending with the roadmap issue that delivers them.
 *
 * @package Blixis\Tooling
 */

declare(strict_types=1);

namespace Blixis\Tooling\Tests;

use Blixis\Tooling\Fixtures;
use Opis\JsonSchema\Validator;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use stdClass;

// Test code reads repository files on purpose.
// phpcs:disable WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents,WordPress.PHP.DiscouragedPHPFunctions

/**
 * Contract registry and JSON Schema shape parity.
 */
final class ContractsTest extends TestCase {

	/**
	 * Repository root.
	 *
	 * @return string
	 */
	private static function root(): string {
		return dirname( __DIR__, 3 );
	}

	/**
	 * Reads and strictly decodes a repository JSON file.
	 *
	 * @param string $relative Path relative to the repository root.
	 * @return mixed
	 */
	private static function json( string $relative ): mixed {
		$text = file_get_contents( self::root() . '/' . $relative );
		self::assertNotFalse( $text, $relative );
		return Fixtures::decode( (string) $text );
	}

	/**
	 * JSON files below a registry path (file or directory), sorted.
	 *
	 * @param string $path Repository-relative file or directory.
	 * @return list<string>
	 */
	private static function files_under( string $path ): array {
		$absolute = self::root() . '/' . $path;
		if ( is_file( $absolute ) ) {
			return array( $path );
		}
		$found    = array();
		$iterator = new \RecursiveIteratorIterator( new \RecursiveDirectoryIterator( $absolute, \FilesystemIterator::SKIP_DOTS ) );
		foreach ( $iterator as $file ) {
			if ( $file instanceof \SplFileInfo && 'json' === $file->getExtension() ) {
				$found[] = ltrim( substr( $file->getPathname(), strlen( self::root() ) ), '/' );
			}
		}
		sort( $found );
		return $found;
	}

	/**
	 * Registry suites.
	 *
	 * @return list<stdClass>
	 */
	private static function suites(): array {
		$registry = self::json( 'tests/fixtures/contracts.json' );
		self::assertInstanceOf( stdClass::class, $registry );
		self::assertSame( 1, get_object_vars( $registry )['contractVersion'] ?? null );
		self::assertIsArray( $registry->suites );
		return array_values( $registry->suites );
	}

	/**
	 * Every registered file is readable by the strict PHP scanner, runners exist and PHP gaps point at roadmap issues.
	 */
	public function test_registry_is_consistent_for_php(): void {
		$roadmap = (string) file_get_contents( self::root() . '/docs/roadmap/issues.csv' );
		$levels  = array();
		foreach ( self::suites() as $suite ) {
			$this->assertNotSame( '', trim( $suite->description ), $suite->id );
			foreach ( $suite->paths as $path ) {
				$files = self::files_under( $path );
				$this->assertNotEmpty( $files, $suite->id . ': ' . $path );
				foreach ( $files as $file ) {
					self::json( $file );
				}
			}
			foreach ( $suite->ts as $runner ) {
				$this->assertFileExists( self::root() . '/' . $runner );
			}
			$level = $suite->php->level;
			$this->assertContains( $level, array( 'full', 'shape', 'pending' ), $suite->id );
			if ( 'pending' !== $level ) {
				$this->assertFileExists( self::root() . '/' . $suite->php->runner, $suite->id );
			}
			if ( 'full' !== $level ) {
				$this->assertMatchesRegularExpression( '/^BWB-\d{3}$/', $suite->php->issue, $suite->id );
				$this->assertStringContainsString( "\n" . $suite->php->issue . ',', "\n" . $roadmap, $suite->id );
			}
			$levels[ $level ] = ( $levels[ $level ] ?? 0 ) + 1;
		}
		$this->assertGreaterThanOrEqual( 8, array_sum( $levels ) );
	}

	/**
	 * Validates a decoded value against a registered JSON Schema.
	 *
	 * @param mixed  $data     Decoded value (objects as stdClass).
	 * @param string $schema   Repository-relative schema path.
	 * @param string $schema_id The schema's $id.
	 * @return bool
	 */
	private static function conforms( mixed $data, string $schema, string $schema_id ): bool {
		static $validator  = null;
		static $registered = array();
		if ( null === $validator ) {
			$validator = new Validator();
		}
		$resolver = $validator->resolver();
		if ( null !== $resolver && ! isset( $registered[ $schema_id ] ) ) {
			$resolver->registerRaw( (string) file_get_contents( self::root() . '/' . $schema ), $schema_id );
			$registered[ $schema_id ] = true;
		}
		return $validator->validate( $data, $schema_id )->isValid();
	}

	/**
	 * Document fixtures.
	 *
	 * @return array<string, array{string}>
	 */
	public static function document_fixtures(): array {
		$out = array();
		foreach ( self::files_under( 'tests/fixtures/documents' ) as $file ) {
			$out[ basename( $file ) ] = array( $file );
		}
		return $out;
	}

	/**
	 * The JSON Schema accepts every document fixture except the ones that expect a schema error.
	 *
	 * @param string $file Fixture path.
	 */
	#[DataProvider( 'document_fixtures' )]
	public function test_document_fixtures_match_the_json_schema( string $file ): void {
		$fixture  = Fixtures::load( self::root() . '/' . $file );
		$expected = is_object( $fixture->expected ) && isset( $fixture->expected->error ) ? $fixture->expected->error : null;
		$this->assertSame(
			'schema' !== $expected,
			self::conforms( $fixture->input, 'packages/core/schema/document.schema.json', 'urn:blixis:wp-blocks:document:1' ),
			$fixture->id
		);
	}

	/**
	 * Token set corpus cases.
	 *
	 * @return array<string, array{string, stdClass}>
	 */
	public static function token_cases(): array {
		$corpus = self::json( 'packages/style-engine/corpus/token-sets.json' );
		$out    = array();
		if ( $corpus instanceof stdClass && is_array( $corpus->cases ) ) {
			foreach ( $corpus->cases as $case ) {
				$out[ $case->id ] = array( $case->id, $case );
			}
		}
		return $out;
	}

	/**
	 * The JSON Schema agrees with the corpus about shape: only schema, reserved-key and unreadable outcomes are shape errors.
	 *
	 * @param string   $id   Case id.
	 * @param stdClass $token_case Case.
	 */
	#[DataProvider( 'token_cases' )]
	public function test_token_corpus_matches_the_json_schema( string $id, stdClass $token_case ): void {
		$shape_errors = array( 'schema', 'reserved-key', 'unreadable' );
		$expected     = true;
		if ( false === $token_case->expect->ok ) {
			foreach ( $token_case->expect->issues as $issue ) {
				if ( in_array( $issue->code, $shape_errors, true ) ) {
					$expected = false;
				}
			}
		}
		$this->assertSame(
			$expected,
			self::conforms( $token_case->input, 'packages/design-tokens/schema/token-set.schema.json', 'urn:blixis:wp-blocks:token-set:1' ),
			$id
		);
	}
}
