<?php
/**
 * Appearance setup entry point.
 *
 * @package Blixis\Theme
 */

declare(strict_types=1);

namespace Blixis\Theme;

defined( 'ABSPATH' ) || exit;

/**
 * Registers a permission-checked notice, page and POST actions.
 */
final class SetupAdmin {

	private const CAPABILITY   = 'edit_theme_options';
	private const NONCE_ACTION = 'blixis_setup_action';

	/**
	 * Register admin hooks.
	 *
	 * @return void
	 */
	public static function register(): void {
		add_action( 'admin_menu', array( self::class, 'menu' ) );
		add_action( 'admin_notices', array( self::class, 'notice' ) );
		add_action( 'admin_post_blixis_setup_start', array( self::class, 'start' ) );
		add_action( 'admin_post_blixis_setup_dismiss', array( self::class, 'dismiss' ) );
	}

	/**
	 * Add the Appearance submenu.
	 *
	 * @return void
	 */
	public static function menu(): void {
		add_theme_page( __( 'Blixis setup', 'blixis' ), __( 'Blixis setup', 'blixis' ), self::CAPABILITY, 'blixis-setup', array( self::class, 'page' ) );
	}

	/**
	 * Show a non-blocking notice on regular admin screens while setup is available.
	 *
	 * @return void
	 */
	public static function notice(): void {
		if ( ! current_user_can( self::CAPABILITY ) || is_network_admin() ) {
			return;
		}
		$state = SetupState::get();
		if ( null === $state || ! in_array( $state['status'], array( 'not_started', 'in_progress' ), true ) ) {
			return;
		}
		?>
		<div class="notice notice-info">
			<p><?php echo esc_html__( 'Set up the Blixis theme when you are ready.', 'blixis' ); ?></p>
			<?php self::action_form( 'start', __( 'Start setup', 'blixis' ) ); ?>
			<?php self::action_form( 'dismiss', __( 'Dismiss', 'blixis' ) ); ?>
		</div>
		<?php
	}

	/**
	 * Render the entry page until BWB-034 supplies the wizard interface.
	 *
	 * @return void
	 */
	public static function page(): void {
		self::require_capability();
		$state  = SetupState::get();
		$status = null === $state ? __( 'Unavailable', 'blixis' ) : $state['status'];
		?>
		<div class="wrap">
			<h1><?php echo esc_html__( 'Blixis setup', 'blixis' ); ?></h1>
			<p><?php echo esc_html__( 'Setup wizard arrives with BWB-034.', 'blixis' ); ?></p>
			<p><?php echo esc_html__( 'Current status:', 'blixis' ); ?> <strong><?php echo esc_html( $status ); ?></strong></p>
			<?php if ( null !== $state && in_array( $state['status'], array( 'not_started', 'in_progress' ), true ) ) : ?>
				<?php self::action_form( 'start', 'in_progress' === $state['status'] ? __( 'Resume setup', 'blixis' ) : __( 'Start setup', 'blixis' ) ); ?>
			<?php endif; ?>
		</div>
		<?php
	}

	/**
	 * Render a nonce-protected POST form.
	 *
	 * @param string $action Action suffix.
	 * @param string $label  Button label.
	 * @return void
	 */
	private static function action_form( string $action, string $label ): void {
		?>
		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="display:inline-block;margin:0 1em 1em 0">
			<input type="hidden" name="action" value="<?php echo esc_attr( 'blixis_setup_' . $action ); ?>">
			<?php wp_nonce_field( self::NONCE_ACTION, 'blixis_setup_nonce_' . $action ); ?>
			<button type="submit" class="button button-secondary"><?php echo esc_html( $label ); ?></button>
		</form>
		<?php
	}

	/**
	 * Start or resume setup.
	 *
	 * @return void
	 */
	public static function start(): void {
		self::handle( 'start' );
	}

	/**
	 * Dismiss the setup notice.
	 *
	 * @return void
	 */
	public static function dismiss(): void {
		self::handle( 'dismiss' );
	}

	/**
	 * Apply one authorized, CSRF-protected action and return to Appearance or setup.
	 *
	 * @param string $action start or dismiss.
	 * @return void
	 */
	private static function handle( string $action ): void {
		self::require_capability();
		if ( 'POST' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) ) {
			wp_die( esc_html__( 'Method not allowed.', 'blixis' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( self::NONCE_ACTION, 'blixis_setup_nonce_' . $action );
		$next = SetupState::transition( get_option( SetupState::OPTION, false ), $action, gmdate( DATE_ATOM ) );
		if ( null !== $next ) {
			update_option( SetupState::OPTION, $next, false );
		}
		wp_safe_redirect( admin_url( 'dismiss' === $action ? 'themes.php' : 'themes.php?page=blixis-setup' ) );
		exit;
	}

	/**
	 * Refuse direct page and action access without the theme capability.
	 *
	 * @return void
	 */
	private static function require_capability(): void {
		if ( ! current_user_can( self::CAPABILITY ) ) {
			wp_die( esc_html__( 'You are not allowed to manage theme setup.', 'blixis' ), '', array( 'response' => 403 ) );
		}
	}
}
