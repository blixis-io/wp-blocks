<?php
/**
 * Hostile REST request matrix with storage observation.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Tests;

use Blixis\Builder\Autoloader;
use Blixis\Builder\Preview\StructurePreviewRenderer;
use Blixis\Builder\Publication\Publisher;
use Blixis\Builder\Registry\ElementRegistry;
use Blixis\Builder\Rest\DocumentRequest;
use Blixis\Builder\Rest\DocumentController;
use Blixis\Builder\Rest\MediaController;
use Blixis\Builder\Rest\FakePostAccess;
use Blixis\Builder\Rest\FakeSiteLocale;
use Blixis\Builder\Rest\PreviewRequest;
use Blixis\Builder\Rest\PublicationRequest;
use Blixis\Builder\Rest\StatusRequest;
use Blixis\Builder\Storage\Envelope;
use Blixis\Builder\Storage\EnvelopeValidator;
use Blixis\Builder\Storage\FakeDatabase;
use Blixis\Builder\Storage\SnapshotStore;
use Blixis\Builder\Storage\StreamStore;
use Blixis\Builder\Theme\ThemeCompat;
use Blixis\Builder\Theme\WordPressCompatibilityReader;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test fixture.
}
require_once \dirname( __DIR__ ) . '/src/Autoloader.php';
Autoloader::register();
require_once __DIR__ . '/FakeDatabase.php';
require_once __DIR__ . '/FakePostAccess.php';
require_once __DIR__ . '/FakeSiteLocale.php';
require_once __DIR__ . '/RestWordPressStubs.php';
require_once __DIR__ . '/PublicationWordPressStubs.php';
require_once __DIR__ . '/StorageWordPressFunctions.php';

/** Refused requests have stable, non-reflective errors and never reach postmeta. */
final class HostilePayloadTest extends TestCase {
	/** Malformed and oversized document writes stop before storage. */
	public function test_document_rejection_matrix(): void {
		$db      = new FakeDatabase();
		$request = new DocumentRequest( new StreamStore( $db ), new FakePostAccess() );
		$valid   = '{"schemaVersion":1,"layoutRevision":1,"root":[]}';
		$cases   = [
			[ null, $valid, 'application/json', null, 428, 'blixis_precondition_required' ],
			[ '"0"' . \str_repeat( 'x', 10000 ), $valid, 'application/json', null, 400, 'blixis_invalid_revision' ],
			[ "\"0\0\"", $valid, 'application/json', null, 400, 'blixis_invalid_revision' ],
			[ '"-1"', $valid, 'application/json', null, 400, 'blixis_invalid_revision' ],
			[ '"9223372036854775808"', $valid, 'application/json', null, 400, 'blixis_invalid_revision' ],
			[ '"0"', \str_repeat( 'x', Envelope::MAX_BYTES + 1 ), 'application/json', null, 413, 'blixis_too_large' ],
			[ '"0"', \str_repeat( ' ', Envelope::MAX_BYTES - 1 ), 'application/json', null, 422, 'blixis_invalid_document' ],
			[ '"0"', \str_repeat( ' ', Envelope::MAX_BYTES ), 'application/json', null, 422, 'blixis_invalid_document' ],
			[ '"0"', $valid, 'text/html', null, 422, 'blixis_invalid_document' ],
			[ '"0"', "\xff", 'application/json', null, 422, 'blixis_invalid_document' ],
			[ '"0"', '{"schemaVersion":1,"layoutRevision":1,"root":[],"n":1e999}', 'application/json', null, 422, 'blixis_invalid_document' ],
			[ '"0"', '{"schemaVersion":1,"layoutRevision":1,"root":[],"n":"NaN"}', 'application/json', '../', 400, 'blixis_invalid_locale' ],
			[ '"0"', '{"schemaVersion":1,"layoutRevision":1,"root":[]}', 'application/json', 'nl_NL%00', 400, 'blixis_invalid_locale' ],
			[ '"0"', '{"schemaVersion":1,"layoutRevision":1,"root":[]}', 'application/json', "nl_NL' OR 1=1", 400, 'blixis_invalid_locale' ],
			[ '"0"', '{"schemaVersion":1,"layoutRevision":1,"root":[]}', 'application/json', "nl_\u{202e}NL", 400, 'blixis_invalid_locale' ],
		];
		foreach ( $cases as [ $match, $body, $type, $locale, $status, $code ] ) {
			$start  = \microtime( true );
			$result = $request->put( 5, $locale, $match, $body, $type );
			$this->assertSame( [ $status, $code ], [ $result->status, $result->error_code ] );
			$this->assertLessThan( 2.0, \microtime( true ) - $start );
			$this->assertSafeMessage( $result->message ?? '', $body );
			$this->assertSame( [], $db->read_keys );
		}
	}

	/** Deep JSON and 100,000 shallow values are rejected before storage. */
	public function test_deep_and_wide_json(): void {
		$db      = new FakeDatabase();
		$request = new DocumentRequest( new StreamStore( $db ), new FakePostAccess() );
		$deep    = '{"schemaVersion":1,"layoutRevision":1,"root":[],"x":' . \str_repeat( '[', 33 ) . '0' . \str_repeat( ']', 33 ) . '}';
		$wide    = (string) \json_encode(
			[
				'schemaVersion'  => 1,
				'layoutRevision' => 1,
				'root'           => [],
				'x'              => \array_fill( 0, 100000, null ),
			]
		); // phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode -- Test fixture.
		foreach ( [ $deep, $wide ] as $body ) {
			$start  = \microtime( true );
			$result = $request->put( 5, null, '"0"', $body, 'application/json' );
			$this->assertSame( [ 422, 'blixis_invalid_document' ], [ $result->status, $result->error_code ] );
			$this->assertLessThan( 2.0, \microtime( true ) - $start );
			$this->assertSame( [], $db->read_keys );
		}
	}

	/** Route IDs must be positive canonical machine integers. */
	public function test_post_id_edges(): void {
		foreach ( [ 0, -1, '0', '-1', '9223372036854775808', '1e5', "1\0" ] as $id ) {
			$error = DocumentController::validate_post_id( $id );
			$this->assertInstanceOf( \WP_Error::class, $error );
			$this->assertSame( [ 'blixis_invalid_post_id', 400 ], [ $error->code, $error->data['status'] ] );
		}
		$this->assertTrue( DocumentController::validate_post_id( 1 ) );
	}

	/** Duplicate IDs and node counts over 5000 are refused at the write boundary. */
	public function test_document_tree_caps_precede_storage(): void {
		$db      = new FakeDatabase();
		$request = new DocumentRequest( new StreamStore( $db ), new FakePostAccess() );
		$node    = [
			'id'       => 'same',
			'type'     => 'blixis/text',
			'children' => [],
		];
		foreach ( [
			[ $node, $node ],
			\array_map(
				static fn ( int $i ): array => [
					'id'       => 'n' . $i,
					'type'     => 'blixis/text',
					'children' => [],
				],
				\range( 0, 5000 )
			),
		] as $root ) {
			$body   = (string) \json_encode(
				[
					'schemaVersion'  => 1,
					'layoutRevision' => 1,
					'root'           => $root,
				]
			); // phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode -- Test fixture.
			$start  = \microtime( true );
			$result = $request->put( 5, null, '"0"', $body, 'application/json' );
			$this->assertSame( [ 422, 'blixis_invalid_document' ], [ $result->status, $result->error_code ] );
			$this->assertLessThan( 2.0, \microtime( true ) - $start );
			$this->assertSame( [], $db->read_keys );
		}
	}

	/** Preview and publication reject bad JSON, locale and headers without reading streams. */
	public function test_preview_and_publication_rejections(): void {
		$db        = new FakeDatabase();
		$streams   = new StreamStore( $db );
		$documents = new DocumentRequest( $streams, new FakePostAccess() );
		$preview   = new PreviewRequest( $documents, $streams, new EnvelopeValidator(), new StructurePreviewRenderer(), new FakeSiteLocale() );
		foreach ( [
			[ \str_repeat( 'x', Envelope::MAX_BYTES + 1 ), 'application/json', 413, 'blixis_too_large' ],
			[ '{', 'application/json', 422, 'blixis_invalid_document' ],
			[ '{"locale":"../"}', 'application/json', 400, 'blixis_invalid_locale' ],
			[ '{"locale":"%00"}', 'application/json', 400, 'blixis_invalid_locale' ],
			[ '{"mode":"<script>"}', 'application/json', 400, 'blixis_invalid_mode' ],
			[ '{}', 'text/plain', 422, 'blixis_invalid_document' ],
		] as [ $body, $type, $status, $code ] ) {
			$result = $preview->preview( 5, $body, $type );
			$this->assertSame( [ $status, $code ], [ $result->status, $result->error_code ] );
			$this->assertSafeMessage( $result->message ?? '', $body );
			$this->assertSame( [], $db->read_keys );
		}
		$publisher   = new Publisher( $db, $streams, new SnapshotStore( $db, $streams ), ElementRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/core-elements.json' ) );
		$publication = new PublicationRequest( $publisher, new FakePostAccess(), new FakeSiteLocale() );
		foreach ( [ '{"locale":"../"}', '{"layout":1}', '{"layoutSnapshot":0}', \str_repeat( 'x', 513 ) ] as $body ) {
			$result = $publication->publish( 5, '"0"', $body );
			$this->assertSame( [ 422, 'blixis_invalid_document' ], [ $result->status, $result->code ] );
			$this->assertSame( [], $db->read_keys );
		}
	}

	/** Status rejects unauthenticated and unauthorized requests before consulting theme state. */
	public function test_status_permission(): void {
		$request   = new StatusRequest( new ThemeCompat( new WordPressCompatibilityReader() ) );
		$anonymous = $request->permission( false, false );
		$forbidden = $request->permission( true, false );
		$this->assertNotNull( $anonymous );
		$this->assertNotNull( $forbidden );
		$this->assertSame( [ 401, 'blixis_unauthenticated' ], [ $anonymous->status, $anonymous->error_code ] );
		$this->assertSame( [ 403, 'blixis_forbidden' ], [ $forbidden->status, $forbidden->error_code ] );
	}

	/** Media descriptions require a logged-in post editor. */
	public function test_media_permission(): void {
		\BlixisMediaAuthState::$logged_in = false;
		$anonymous                        = MediaController::permission();
		$this->assertInstanceOf( \WP_Error::class, $anonymous );
		$this->assertSame( [ 'blixis_unauthenticated', 401 ], [ $anonymous->code, $anonymous->data['status'] ] );
		\BlixisMediaAuthState::$logged_in = true;
		$forbidden                        = MediaController::permission();
		$this->assertInstanceOf( \WP_Error::class, $forbidden );
		$this->assertSame( [ 'blixis_forbidden', 403 ], [ $forbidden->code, $forbidden->data['status'] ] );
		\BlixisMediaAuthState::$logged_in = false;
	}

	/**
	 * Error messages may not reflect input or implementation details.
	 *
	 * @param string $message Error message.
	 * @param string $body Submitted body.
	 */
	private function assertSafeMessage( string $message, string $body ): void {
		$this->assertNotSame( $body, $message );
		$this->assertDoesNotMatchRegularExpression( '~(?:/Users/|/var/|SELECT |INSERT |\\\\[A-Za-z]+\\\\|<script>)~i', $message );
	}
}
