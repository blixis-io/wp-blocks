<?php
/**
 * Document REST policy tests for BWB-041.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Rest;

use Blixis\Builder\Autoloader;
use Blixis\Builder\Storage\Envelope;
use Blixis\Builder\Storage\FakeDatabase;
use Blixis\Builder\Storage\MetaKeys;
use Blixis\Builder\Storage\StreamStore;
use Blixis\Builder\Theme\CompatibilityReader;
use Blixis\Builder\Theme\ThemeCompat;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test fixture.
}
require_once \dirname( __DIR__ ) . '/src/Autoloader.php';
Autoloader::register();
require_once __DIR__ . '/FakeDatabase.php';
require_once __DIR__ . '/FakePostAccess.php';
require_once __DIR__ . '/RestWordPressStubs.php';

/** Contract, authorization and safe error tests. */
final class DocumentRestTest extends TestCase {
	/** In-memory postmeta database.
	 *
	 * @var FakeDatabase
	 */
	private FakeDatabase $database;
	/** Mutable post access fake.
	 *
	 * @var FakePostAccess
	 */
	private FakePostAccess $access;
	/** Request policy under test.
	 *
	 * @var DocumentRequest
	 */
	private DocumentRequest $documents;
	/** Valid layout envelope. */
	private const LAYOUT = '{"schemaVersion":1,"layoutRevision":1,"root":[]}';

	/** Set up isolated storage and permissions. */
	protected function setUp(): void {
		$this->database  = new FakeDatabase();
		$this->access    = new FakePostAccess();
		$this->documents = new DocumentRequest( new StreamStore( $this->database ), $this->access );
	}

	/** All inaccessible object conditions produce the same forbidden response. */
	public function test_permission_matrix(): void {
		$this->assertNull( $this->documents->permission( 5 ) );
		$this->access->authenticated = false;
		$this->assertError( 401, 'blixis_unauthenticated', $this->documents->permission( 5 ) );
		$this->access->authenticated = true;
		$this->access->can_edit      = false;
		$denied                      = $this->documents->permission( 5 );
		$this->assertError( 403, 'blixis_forbidden', $denied );
		$this->access->can_edit = true;
		$this->access->exists   = false;
		$this->assertEquals( $denied, $this->documents->permission( 5 ) );
		$this->access->exists   = true;
		$this->access->opted_in = false;
		$this->assertEquals( $denied, $this->documents->permission( 5 ) );
		$this->assertEquals( $denied, $this->documents->permission( 999 ) );
	}

	/** Quoted canonical integers alone are valid preconditions and ETags. */
	public function test_revision_headers(): void {
		$this->assertSame( 0, DocumentRequest::parse_if_match( '"0"' ) );
		$this->assertSame( 12, DocumentRequest::parse_if_match( '"12"' ) );
		$this->assertSame( '"12"', DocumentRequest::etag( 12 ) );
		foreach ( [ null, '', '12', '"01"', '"-1"', '"1", "2"', 'W/"1"', '"1"\r\nX: y', '"999999999999999999999999999999"', '"' . PHP_INT_MAX . '"', '*', ' "1" ' ] as $header ) {
			$this->assertNull( DocumentRequest::parse_if_match( $header ) );
		}
	}

	/** Empty reads do not insert rows; successful writes advance revisions. */
	public function test_get_put_and_conflict(): void {
		$empty = $this->documents->get( 5, null );
		$this->assertSame(
			[
				'revision' => 0,
				'locale'   => null,
				'document' => null,
			],
			$empty->body
		);
		$this->assertSame( [], $this->database->rows( 5, MetaKeys::LAYOUT ) );
		$written = $this->documents->put( 5, null, '"0"', self::LAYOUT, 'application/json' );
		$this->assertSame( [ 'revision' => 1 ], $written->body );
		$this->assertSame( 1, $written->revision );
		$read = $this->documents->get( 5, null );
		$this->assertSame( 1, $read->body['revision'] );
		$this->assertSame( 1, $read->body['document']->layoutRevision );
		$this->assertError( 409, 'blixis_conflict', $this->documents->put( 5, null, '"0"', self::LAYOUT, 'application/json' ) );
		$this->assertSame(
			[
				'currentRevision'  => 1,
				'expectedRevision' => 0,
			],
			$this->documents->put( 5, null, '"0"', self::LAYOUT, 'application/json' )->body
		);
	}

	/** The input and storage failures map to stable codes without leaking values. */
	public function test_error_mapping(): void {
		$this->assertError( 428, 'blixis_precondition_required', $this->documents->put( 5, null, null, self::LAYOUT, 'application/json' ) );
		$this->assertError( 400, 'blixis_invalid_revision', $this->documents->put( 5, null, 'evil', self::LAYOUT, 'application/json' ) );
		$this->assertError( 413, 'blixis_too_large', $this->documents->put( 5, null, '"0"', \str_repeat( 'x', Envelope::MAX_BYTES + 1 ), 'application/json' ) );
		$this->assertError( 422, 'blixis_invalid_document', $this->documents->put( 5, null, '"0"', '{', 'application/json' ) );
		$this->assertError( 422, 'blixis_invalid_document', $this->documents->put( 5, null, '"0"', self::LAYOUT, 'text/plain' ) );
		$this->database->insert( 5, MetaKeys::LAYOUT, self::LAYOUT );
		$this->database->insert( 5, MetaKeys::LAYOUT, self::LAYOUT );
		$this->assertError( 500, 'blixis_storage_error', $this->documents->get( 5, null ) );
		$this->assertError( 500, 'blixis_storage_error', $this->documents->put( 5, null, '"1"', self::LAYOUT, 'application/json' ) );
	}

	/** Invalid locale and publication-key attempts cannot touch storage. */
	public function test_locale_and_unreachable_keys(): void {
		foreach ( [ 'NL_nl', '../bad', '_blixis_published', '_blixis_snap_layout_1', \str_repeat( 'a', 21 ) ] as $locale ) {
			$this->assertError( 400, 'blixis_invalid_locale', $this->documents->get( 5, $locale ) );
			$this->assertError( 400, 'blixis_invalid_locale', $this->documents->put( 5, $locale, '"0"', self::LAYOUT, 'application/json' ) );
		}
		$content = '{"schemaVersion":1,"contentRevision":1}';
		$this->assertSame( 1, $this->documents->put( 5, 'nl_NL', '"0"', $content, 'application/json' )->revision );
		$this->assertSame( [], $this->database->rows( 5, MetaKeys::PUBLISHED ) );
		$this->assertSame( [], $this->database->snapshot_keys( 5 ) );
	}

	/** Reading never writes. Nonce enforcement belongs to WordPress core and is verified by the real-WordPress smoke. */
	public function test_get_is_read_only(): void {
		$controller = new DocumentController( $this->documents );
		$this->assertTrue( $controller->permission( new \WP_REST_Request( 'GET', 5 ) ) );
		$this->documents->get( 5, null );
		$this->assertSame( [], $this->database->rows( 5, MetaKeys::LAYOUT ) );
	}

	/** Write permission locks before any storage operation while GET remains available. */
	public function test_controller_theme_lock(): void {
		ThemeCompat::reset_for_tests();
		$reader     = new class() implements CompatibilityReader {
			/** Fixture context. */
			public function context_key(): string {
				return 'document-rest';
			}
			/** No version. */
			public function declared(): ?int {
				return null;
			}
			/** No declaration. */
			public function invalid_declaration(): bool {
				return false;
			}
			/** Display name. */
			public function active_theme_name(): string {
				return 'Other';
			}
		};
		$guard      = new ThemeGuard( $this->access, new ThemeCompat( $reader ) );
		$controller = new DocumentController( new DocumentRequest( new StreamStore( $this->database ), $this->access, null, $guard ) );
		$request    = new \WP_REST_Request( 'PUT', 5 );
		$this->assertTrue( $controller->permission( $request ) );
		$denied = $controller->permission_write( $request );
		$this->assertInstanceOf( \WP_Error::class, $denied );
		$this->assertSame( 'blixis_theme_incompatible', $denied->code );
		$this->assertSame(
			[
				'status'       => 423,
				'reason'       => 'not-declared',
				'theme'        => 'Other',
				'declared'     => null,
				'supportedMin' => 1,
				'supportedMax' => 1,
			],
			$denied->data
		);
		$this->assertSame( [], $this->database->rows( 5, MetaKeys::LAYOUT ) );
	}

	/** Verify stable, safe error fields.
	 *
	 * @param int                 $status Expected HTTP status.
	 * @param string              $code Expected error code.
	 * @param DocumentResult|null $result Result under test.
	 */
	private function assertError( int $status, string $code, ?DocumentResult $result ): void {
		$this->assertNotNull( $result );
		$this->assertSame( $status, $result->status );
		$this->assertSame( $code, $result->error_code );
		$this->assertStringNotContainsString( 'Injected', $result->message ?? '' );
		$this->assertStringNotContainsString( '/', $result->message ?? '' );
	}
}
