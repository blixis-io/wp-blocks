<?php
/**
 * WordPress preview REST transport.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Rest;

use Blixis\Builder\Preview\PreviewRenderer;
use Blixis\Builder\Preview\StructurePreviewRenderer;
use Blixis\Builder\Storage\EnvelopeValidator;
use Blixis\Builder\Storage\StreamStore;
use Blixis\Builder\Storage\WpdbDatabase;

\defined( 'ABSPATH' ) || exit;

/** Registers the preview next to document routes. */
final class PreviewController {
	/** Construct a preview transport.
	 *
	 * @param PreviewRequest  $preview Request policy.
	 * @param DocumentRequest $documents Permission policy.
	 */
	public function __construct( private PreviewRequest $preview, private DocumentRequest $documents ) {}

	/** Register the POST endpoint. */
	public static function register(): void {
		global $wpdb;
		$streams    = new StreamStore( new WpdbDatabase( $wpdb ) );
		$documents  = new DocumentRequest( $streams, new WordPressPostAccess() );
		$renderer   = self::select_renderer( \apply_filters( 'blixis_builder_preview_renderer', new StructurePreviewRenderer() ) );
		$controller = new self( new PreviewRequest( $documents, $streams, new EnvelopeValidator(), $renderer, new WordPressSiteLocale() ), $documents );
		\register_rest_route(
			'blixis/v1',
			'/documents/(?P<post_id>\d+)/preview',
			[
				'methods'             => 'POST',
				'callback'            => [ $controller, 'post' ],
				'permission_callback' => [ $controller, 'permission' ],
				'args'                => [
					'post_id' => [
						'type'              => 'integer',
						'required'          => true,
						'validate_callback' => [ DocumentController::class, 'validate_post_id' ],
					],
				],
			]
		);
		\add_filter( 'rest_post_dispatch', [ $controller, 'no_store' ], 10, 3 );
	}

	/** Mark successful and error responses for this route as private.
	 *
	 * @param mixed            $response REST response.
	 * @param mixed            $server REST server.
	 * @param \WP_REST_Request $request REST request.
	 * @return mixed Response with cache header where applicable.
	 */
	public function no_store( mixed $response, mixed $server, \WP_REST_Request $request ): mixed {
		if ( $response instanceof \WP_REST_Response && 1 === \preg_match( '~^/blixis/v1/documents/[1-9][0-9]*/preview$~D', $request->get_route() ) ) {
			$response->header( 'Cache-Control', 'private, no-store' );
		}
		return $response;
	}

	/** Ignore filter results that do not satisfy the preview renderer contract.
	 *
	 * @param mixed $candidate Filter result.
	 */
	public static function select_renderer( mixed $candidate ): PreviewRenderer {
		return $candidate instanceof PreviewRenderer ? $candidate : new StructurePreviewRenderer();
	}

	/** Apply the same post policy before touching any stream.
	 *
	 * @param \WP_REST_Request $request REST request.
	 */
	public function permission( \WP_REST_Request $request ): true|\WP_Error {
		$result = $this->documents->permission( (int) $request->get_param( 'post_id' ) );
		return null === $result ? true : new \WP_Error( $result->error_code ?? 'blixis_forbidden', $result->message ?? 'Document access is forbidden.', [ 'status' => $result->status ] );
	}

	/** Run the preview policy and send a non-cacheable fragment response.
	 *
	 * @param \WP_REST_Request $request REST request.
	 */
	public function post( \WP_REST_Request $request ): \WP_REST_Response|\WP_Error {
		$result = $this->preview->preview( (int) $request->get_param( 'post_id' ), $request->get_body(), (string) $request->get_header( 'content-type' ) );
		if ( null !== $result->error_code ) {
			return new \WP_Error( $result->error_code, $result->message ?? 'Preview failed.', [ 'status' => $result->status ] );
		}
		$response = new \WP_REST_Response( $result->body, 200 );
		$response->header( 'Cache-Control', 'private, no-store' );
		return $response;
	}
}
