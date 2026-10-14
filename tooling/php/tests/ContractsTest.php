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
			return [ $path ];
		}
		$found    = [];
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
		$roadmap = (string) file_get_contents( self::root() . '/docs/roadmap/issues.csv' ) . "\n" . (string) file_get_contents( self::root() . '/docs/roadmap/issues-addendum.csv' );
		$levels  = [];
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
			$this->assertContains( $level, [ 'full', 'shape', 'pending' ], $suite->id );
			if ( 'pending' !== $level ) {
				$this->assertFileExists( self::root() . '/' . $suite->php->runner, $suite->id );
				$this->assertNotEmpty( $suite->php->covers, $suite->id );
				foreach ( $suite->php->covers as $method ) {
					if ( 'tooling/php/tests/ContractsTest.php' === $suite->php->runner ) {
						$this->assertTrue( method_exists( self::class, $method ), $suite->id . ': ' . $method );
					}
				}
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
	 * @param mixed  $data      Decoded value (objects as stdClass).
	 * @param string $schema    Repository-relative schema path.
	 * @param string $schema_id The schema's $id.
	 * @return \Opis\JsonSchema\ValidationResult
	 */
	private static function validate( mixed $data, string $schema, string $schema_id ): \Opis\JsonSchema\ValidationResult {
		static $validator  = null;
		static $registered = [];
		if ( null === $validator ) {
			$validator = new Validator();
		}
		$resolver = $validator->resolver();
		if ( null !== $resolver && ! isset( $registered[ $schema_id ] ) ) {
			$resolver->registerRaw( (string) file_get_contents( self::root() . '/' . $schema ), $schema_id );
			$registered[ $schema_id ] = true;
		}
		return $validator->validate( $data, $schema_id );
	}

	/**
	 * Whether a value conforms to a registered JSON Schema.
	 *
	 * @param mixed  $data      Decoded value.
	 * @param string $schema    Repository-relative schema path.
	 * @param string $schema_id The schema's $id.
	 * @return bool
	 */
	private static function conforms( mixed $data, string $schema, string $schema_id ): bool {
		return self::validate( $data, $schema, $schema_id )->isValid();
	}

	/**
	 * Where the schema says the data is wrong: the JSON pointers of the innermost failures. A missing required property is
	 * reported at the object by JSON Schema, so each missing name is added as a child pointer.
	 *
	 * @param \Opis\JsonSchema\Errors\ValidationError $error Error tree.
	 * @return list<array{string, string}> Pairs of pointer and keyword.
	 */
	private static function failure_points( \Opis\JsonSchema\Errors\ValidationError $error ): array {
		$subs = $error->subErrors();
		if ( [] !== $subs ) {
			$out = [];
			foreach ( $subs as $sub ) {
				$out = array_merge( $out, self::failure_points( $sub ) );
			}
			return $out;
		}
		$pointer = '/' . implode( '/', array_map( 'strval', $error->data()->fullPath() ) );
		$pointer = rtrim( $pointer, '/' );
		if ( 'required' === $error->keyword() ) {
			$out = [];
			foreach ( (array) ( $error->args()['missing'] ?? [] ) as $name ) {
				$out[] = [ $pointer . '/' . $name, 'required' ];
			}
			return $out;
		}
		return [ [ $pointer, $error->keyword() ] ];
	}

	/**
	 * Converts the TypeScript issue path (`$.root[0].style[0].mode`) to a JSON pointer (`/root/0/style/0/mode`).
	 *
	 * @param string $path Issue path.
	 * @return string
	 */
	private static function pointer_of( string $path ): string {
		$pointer = preg_replace( '/\[(\d+)\]/', '/$1', substr( $path, 1 ) ) ?? '';
		return str_replace( '.', '/', $pointer );
	}

	/**
	 * Whether the schema reports a failure at the expected place. Opis reports a rejected property name at the object that
	 * holds it, so a direct child of a `pattern` failure also counts.
	 *
	 * @param \Opis\JsonSchema\ValidationResult $result   Validation result.
	 * @param string                            $expected Expected pointer.
	 * @return bool
	 */
	private static function fails_at( \Opis\JsonSchema\ValidationResult $result, string $expected ): bool {
		$error = $result->error();
		if ( null === $error ) {
			return false;
		}
		foreach ( self::failure_points( $error ) as list( $pointer, $keyword ) ) {
			if ( $pointer === $expected || ( 'pattern' === $keyword && dirname( $expected ) === $pointer ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Document fixtures.
	 *
	 * @return array<string, array{string}>
	 */
	public static function document_fixtures(): array {
		$out = [];
		foreach ( self::files_under( 'tests/fixtures/documents' ) as $file ) {
			$out[ basename( $file ) ] = [ $file ];
		}
		return $out;
	}

	/**
	 * The JSON Schema accepts every document fixture except the ones that expect a schema error, and rejects those at the
	 * stated place (so a fixture cannot fail for a second, unintended reason).
	 *
	 * @param string $file Fixture path.
	 */
	#[DataProvider( 'document_fixtures' )]
	public function test_document_fixtures_match_the_json_schema( string $file ): void {
		$fixture  = Fixtures::load( self::root() . '/' . $file );
		$outcome  = $fixture->expected;
		$expected = $outcome instanceof stdClass ? ( $outcome->error ?? null ) : null;
		$result   = self::validate( $fixture->input, 'packages/core/schema/document.schema.json', 'urn:blixis:wp-blocks:document:1' );
		$this->assertSame( 'schema' !== $expected, $result->isValid(), $fixture->id );
		if ( 'schema' === $expected && $outcome instanceof stdClass ) {
			$this->assertTrue( self::fails_at( $result, self::pointer_of( (string) ( $outcome->path ?? '' ) ) ), $fixture->id );
		}
	}

	/**
	 * Probes of the JSON Schema features the generated schemas rely on.
	 *
	 * @return array<string, array{string, string, string}>
	 */
	public static function schema_probes(): array {
		$doc = '{"schemaVersion":1,"documentId":"doc-001","layoutRevision":1,"defaultLocale":"en_US","locales":["en_US"],'
			. '"root":[{"id":"el-001","type":"blixis/text","props":{},"children":[CHILD]}],"classListVersion":0,"classRefs":{},'
			. '"translations":{"en_US":TRANSLATIONS},"metadata":{"updatedAt":"2026-01-01T00:00:00Z","editorVersion":"0.0.0"}}';
		$ok  = '{"id":"el-002","type":"blixis/text","props":{},"children":[]}';
		return [
			'a nested child is valid ($ref recursion)'   => [ str_replace( [ 'CHILD', 'TRANSLATIONS' ], [ $ok, '{}' ], $doc ), '', 'valid' ],
			'a nested child is checked ($ref recursion)' => [ str_replace( [ 'CHILD', 'TRANSLATIONS' ], [ '{"id":"el-002","type":"text","props":{},"children":[]}', '{}' ], $doc ), '/root/0/children/0/type', 'pattern' ],
			'a reserved key is refused (key pattern)'    => [ str_replace( [ 'CHILD', 'TRANSLATIONS', '"props":{}' ], [ '', '{}', '"props":{"constructor":1}' ], $doc ), '/root/0/props', 'pattern' ],
			'a non-ASCII letter in an id is refused'     => [ str_replace( [ 'CHILD', 'TRANSLATIONS', 'el-001' ], [ '', '{}', "el-\u{e9}01" ], $doc ), '/root/0/id', 'pattern' ],
			'an empty object is an object, not an array' => [ str_replace( [ 'CHILD', 'TRANSLATIONS' ], [ '', '[]' ], $doc ), '/translations/en_US', 'type' ],
			'props must be an object, [] is refused'     => [ str_replace( [ 'CHILD', 'TRANSLATIONS', '"props":{}' ], [ '', '{}', '"props":[]' ], $doc ), '/root/0/props', 'type' ],
		];
	}

	/**
	 * Each probe is valid, or fails with the given keyword at the given pointer.
	 *
	 * @param string $json    Document JSON.
	 * @param string $pointer Expected failure pointer ('' when valid).
	 * @param string $keyword Expected keyword ('valid' when valid).
	 */
	#[DataProvider( 'schema_probes' )]
	public function test_json_schema_features_behave_as_in_typescript( string $json, string $pointer, string $keyword ): void {
		$result = self::validate( Fixtures::decode( $json ), 'packages/core/schema/document.schema.json', 'urn:blixis:wp-blocks:document:1' );
		if ( 'valid' === $keyword ) {
			$this->assertTrue( $result->isValid() );
			return;
		}
		$this->assertFalse( $result->isValid() );
		$error = $result->error();
		$this->assertNotNull( $error );
		$this->assertContains( [ $pointer, $keyword ], self::failure_points( $error ) );
	}

	/**
	 * Token set corpus cases.
	 *
	 * @return array<string, array{string, stdClass}>
	 */
	public static function token_cases(): array {
		$corpus = self::json( 'packages/style-engine/corpus/token-sets.json' );
		$out    = [];
		if ( $corpus instanceof stdClass && is_array( $corpus->cases ) ) {
			foreach ( $corpus->cases as $case ) {
				$out[ $case->id ] = [ $case->id, $case ];
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
		$shape_errors = [ 'schema', 'reserved-key', 'unreadable' ];
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
